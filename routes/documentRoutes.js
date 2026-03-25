const express = require('express');
const router = express.Router();
const Document = require('../models/Document');
const DocumentType = require('../models/DocumentType');
const User = require('../models/User');
const Department = require('../models/Department');
const Notification = require('../models/Notification');
const mongoose = require('mongoose');
const { protect, authorizeRoles } = require('../middleware/authMiddleware');
const { upload } = require('../config/cloudinary');
const NotificationService = require('../services/notificationService');
 
// Helper: Resolve the final assignee info by following any delegation chains
async function resolveDelegateInfo(userId) {
  if (!userId) return null;
  const user = await User.findById(userId);
  if (!user) return null;

  let currentUser = user;
  let visited = new Set();
  while (currentUser && currentUser.delegatedTo && !visited.has(currentUser._id.toString())) {
    visited.add(currentUser._id.toString());
    const delegate = await User.findById(currentUser.delegatedTo);
    if (!delegate) break;
    currentUser = delegate;
  }
  return { id: currentUser._id.toString(), name: currentUser.name };
}
// Helper: auto-assign approvers by role, student's tutor, and dept HOD
async function autoAssign(steps, student) {
  const assigned = {};
  for (const role of steps) {
    let query = { role: role === 'teacher' ? 'tutor' : role, isApproved: true };
    
    // Precise assignment for Tutor
    if (role === 'tutor' || role === 'teacher') {
      if (student.tutorId) {
        assigned[role] = await resolveDelegateInfo(student.tutorId);
        continue;
      }
    }

    // Precise assignment for HOD
    if (role === 'hod' && student.departmentId) {
      const dept = await Department.findById(student.departmentId);
      if (dept && dept.hodId) {
        assigned[role] = await resolveDelegateInfo(dept.hodId);
        continue;
      }
    }

    // Fallback search
    const user = await User.findOne(query);
    if (user) {
      assigned[role] = await resolveDelegateInfo(user._id);
    }
  }
  return assigned;
}

// @desc    Create a new document request
// @route   POST /api/documents
// @access  Private (Student only)
router.post('/', protect, authorizeRoles('student'), upload.single('file'), async (req, res) => {
  try {
    const { title, customHeading, description, category, priority, formData } = req.body;
    
    // Parse formData if it's stringified from the frontend
    let parsedFormData = formData;
    if (typeof formData === 'string') {
      try { parsedFormData = JSON.parse(formData); } catch (e) {}
    }
    
    // Fetch dynamic workflow from DocumentType model
    const flowDef = await DocumentType.findOne({ name: category, isActive: true });
    if (!flowDef) {
       return res.status(400).json({ message: `Workflow not defined for document type: ${category}` });
    }
    const workflow = flowDef.steps;

    // Auto-assign approvers
    const student = await User.findById(req.user.id);
    const assigned = await autoAssign(workflow, student);

    console.log('Document creation with auto-assigned approvers:', assigned);
    
    const document = new Document({
      studentId: req.user.id,
      title,
      customHeading: customHeading || '',
      description: description || title,
      category,
      flow: category, // Store workflow name
      priority,
      status: 'pending',
      formData: parsedFormData,
      workflow, // Array of roles from flowDef
      assigned, // Map of role -> userId
      studentSignatureUrl: student.signatureUrl, // Save student's signature at time of request
      fileUrl: req.file ? (req.file.path.startsWith('http') ? req.file.path : `${req.protocol}://${req.get('host')}/uploads/${req.file.filename}`) : null,
    });

    const createdDoc = await document.save();
    console.log('Document created successfully:', createdDoc._id);

    // Push notification to first approver
    const firstRole = workflow[0];
    const firstApprover = assigned[firstRole];
    if (firstApprover && firstApprover.id) {
      await NotificationService.send(firstApprover.id, `New document pending: "${title}" from ${student?.name || 'a student'}`, 'info');
    }

    res.status(201).json(createdDoc);
  } catch (error) {
    console.error('Document creation 500 error:', error);
    res.status(500).json({ message: error.message });
  }
});

// @desc    Get documents for user (student sees theirs, others see assigned/all)
// @route   GET /api/documents
// @access  Private
router.get('/', protect, async (req, res) => {
  try {
    let docs;
    if (req.user.role === 'student') {
      docs = await Document.find({ studentId: req.user.id })
        .populate('studentId', 'name registerNo dept')
        .sort({ createdAt: -1 });
    } else if (req.user.role === 'admin') {
      docs = await Document.find({})
        .populate('studentId', 'name registerNo dept')
        .populate('approvals.approverId', 'name role')
        .sort({ createdAt: -1 });
    } else {
      // Approvers see documents where they are strictly assigned
      const userId = req.user.id;
      docs = await Document.find({
        [`assigned.${req.user.role}.id`]: userId
      })
        .populate('studentId', 'name registerNo dept year division tutorId departmentId')
        .populate('approvals.approverId', 'name role')
        .sort({ createdAt: -1 });
    }
    res.json(docs);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// @desc    Add approval/rejection to document
// @route   POST /api/documents/:id/approve
// @access  Private
router.post('/:id/approve', protect, upload.single('signature'), async (req, res) => {
  try {
    const { action, comment, signatureUrl: bodySignatureUrl } = req.body;
    const document = await Document.findById(req.params.id);

    if (!document) {
      return res.status(404).json({ message: 'Document not found' });
    }

    let signatureUrl = null;
    if (req.file) {
      signatureUrl = req.file.path.startsWith('http') 
        ? req.file.path 
        : `${req.protocol}://${req.get('host')}/uploads/${req.file.filename}`;
    } else if (bodySignatureUrl) {
      signatureUrl = bodySignatureUrl;
    }

    // Create approval record with role
    const approvalRecord = {
      approverId: req.user.id,
      role: req.user.role,
      action,
      comment,
      signatureUrl: signatureUrl,
    };
    
    document.approvals.push(approvalRecord);

    // Determine new status
    if (action === 'rejected') {
      document.status = 'rejected';
      document.rejectionReason = comment;
      // Notify student
      await NotificationService.send(document.studentId, `Your "${document.title}" was rejected by ${req.user.role.toUpperCase()}. Reason: ${comment || 'No reason given'}`, 'err');
    } else {
      // Check if all needed persons have signed
      if (document.approvals.length >= document.workflow.length) {
        document.status = 'final_approved';
        await NotificationService.send(document.studentId, `Your "${document.title}" is fully approved and ready for download! 🎓`, 'ok');
      } else {
        document.status = 'partially_approved';
        await NotificationService.send(document.studentId, `Your "${document.title}" has been approved by ${req.user.role.toUpperCase()}. Stage ${document.approvals.length}/${document.workflow.length} complete.`, 'ok');
        
        // Notify next approver
        const nextRole = document.workflow[document.approvals.length];
        const nextApproverInfo = document.assigned instanceof Map ? document.assigned.get(nextRole) : document.assigned[nextRole];
        if (nextApproverInfo && nextApproverInfo.id) {
          await NotificationService.send(nextApproverInfo.id, `Action Required: New document "${document.title}" pending your approval as ${nextRole.toUpperCase()}.`, 'info');
        }
      }
    }

    const updatedDoc = await document.save();
    res.json(updatedDoc);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// @desc    Transfer document to another approver
// @route   POST /api/documents/:id/transfer
// @access  Private (Assigned approver or Admin only)
router.post('/:id/transfer', protect, async (req, res) => {
  try {
    const { newApproverId, role, comment } = req.body;
    const document = await Document.findById(req.params.id);

    if (!document) {
      return res.status(404).json({ message: 'Document not found' });
    }

    // Verify permission: Only the currently assigned person for that role OR Admin can transfer
    const currentAssignedInfo = document.assigned instanceof Map ? document.assigned.get(role) : document.assigned[role];
    const currentAssignedId = currentAssignedInfo?.id || currentAssignedInfo; // Handle legacy strings
    
    if (req.user.role !== 'admin' && currentAssignedId !== req.user.id) {
       return res.status(403).json({ message: 'Only the assigned approver or admin can transfer this document' });
    }

    const newApprover = await User.findById(newApproverId);
    if (!newApprover) {
      return res.status(404).json({ message: 'New approver not found' });
    }

    // Perform transfer in the assignment map
    const newAssignedInfo = { id: newApproverId, name: newApprover.name };
    if (document.assigned instanceof Map) {
      document.assigned.set(role, newAssignedInfo);
    } else {
      document.assigned[role] = newAssignedInfo;
    }
    
    // Explicitly mark map as modified for Mongoose if needed
    document.markModified('assigned');

    // Add a system approval record for tracking the transfer
    document.approvals.push({
      approverId: req.user.id,
      role: req.user.role,
      action: 'forwarded',
      comment: `Transferred to ${newApprover.name}. ${comment || ''}`,
    });

    await document.save();

    // Notify new recipient
    await NotificationService.send(newApproverId, `A document "${document.title}" has been transferred to you for ${role.toUpperCase()} approval by ${req.user.name}.`, 'info');

    res.json({ message: 'Document transferred successfully', document });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// @desc    Update document details (Staff only)
// @route   PUT /api/documents/:id
// @access  Private
router.put('/:id', protect, async (req, res) => {
  try {
    const { title, description, formData, customHeading } = req.body;
    const document = await Document.findById(req.params.id);

    if (!document) {
      return res.status(404).json({ message: 'Document not found' });
    }

    // Authorization: Only the currently assigned person OR Student (if pending) OR Admin can edit
    const user = req.user;
    let canEdit = false;

    if (user.role === 'admin') {
      canEdit = true;
    } else if (user.role === 'student' && document.studentId.toString() === user.id && document.status === 'pending') {
      canEdit = true;
    } else {
      // Check if user is currently assigned to any role in this document
      const assigned = document.assigned;
      for (let role in assigned) {
        const info = assigned[role];
        if (info.id === user.id || info === user.id) {
          canEdit = true;
          break;
        }
      }
    }

    if (!canEdit) {
      return res.status(403).json({ message: 'You are not authorized to edit this document' });
    }

    // Update fields
    if (title) document.title = title;
    if (description) document.description = description;
    if (customHeading !== undefined) document.customHeading = customHeading;
    if (formData) {
      // Merge or replace formData
      document.formData = { ...document.formData, ...formData };
    }

    await document.save();
    res.json(document);
  } catch (error) {
    console.error('Document update error:', error);
    res.status(500).json({ message: error.message });
  }
});

module.exports = router;
