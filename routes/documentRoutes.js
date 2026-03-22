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

// Helper: push notification
async function pushNotif(userId, message, type = 'info') {
  try {
    await Notification.create({ userId, message, type });
  } catch (e) {
    console.error('Notification push failed:', e.message);
  }
}

// Helper: auto-assign approvers by role, student's tutor, and dept HOD
async function autoAssign(steps, student) {
  const assigned = {};
  for (const role of steps) {
    let query = { role: role === 'teacher' ? 'tutor' : role, isApproved: true };
    
    // Precise assignment for Tutor
    if (role === 'tutor' || role === 'teacher') {
      if (student.tutorId) {
        assigned[role] = student.tutorId.toString();
        continue;
      }
    }

    // Precise assignment for HOD
    if (role === 'hod' && student.departmentId) {
      const dept = await Department.findById(student.departmentId);
      if (dept && dept.hodId) {
        assigned[role] = dept.hodId.toString();
        continue;
      }
    }

    // Fallback search
    const user = await User.findOne(query);
    if (user) {
      assigned[role] = user._id.toString();
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
      fileUrl: req.file ? (req.file.path.startsWith('http') ? req.file.path : `${req.protocol}://${req.get('host')}/uploads/${req.file.filename}`) : null,
    });

    const createdDoc = await document.save();
    console.log('Document created successfully:', createdDoc._id);

    // Push notification to first approver
    const firstRole = workflow[0];
    const firstApproverId = assigned[firstRole];
    if (firstApproverId) {
      await pushNotif(firstApproverId, `New document pending: "${title}" from ${student?.name || 'a student'}`, 'info');
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
        [`assigned.${req.user.role}`]: userId
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
      await pushNotif(document.studentId, `Your "${document.title}" was rejected by ${req.user.role.toUpperCase()}. Reason: ${comment || 'No reason given'}`, 'err');
    } else {
      // Check if all needed persons have signed
      if (document.approvals.length >= document.workflow.length) {
        document.status = 'final_approved';
        await pushNotif(document.studentId, `Your "${document.title}" is fully approved! Download your certificate.`, 'ok');
      } else {
        document.status = 'partially_approved';
        await pushNotif(document.studentId, `Your "${document.title}" approved by ${req.user.role.toUpperCase()}.`, 'ok');
        
        // Notify next approver
        const nextRole = document.workflow[document.approvals.length];
        const nextApproverId = document.assigned.get(nextRole);
        if (nextApproverId) {
          await pushNotif(nextApproverId, `Document pending your approval: "${document.title}"`, 'info');
        }
      }
    }

    const updatedDoc = await document.save();
    res.json(updatedDoc);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

module.exports = router;
