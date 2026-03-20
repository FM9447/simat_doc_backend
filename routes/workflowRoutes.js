const express = require('express');
const DocumentType = require('../models/DocumentType');
const { protect, authorizeRoles } = require('../middleware/authMiddleware');
const { upload } = require('../config/cloudinary');

const router = express.Router();

// @desc    Get all document types/flows
// @route   GET /api/workflow
// @access  Public (for students to see available types)
router.get('/', async (req, res) => {
  try {
    const flows = await DocumentType.find({ isActive: true });
    res.json(flows);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});
 
// @desc    Upload workflow asset (seal/logo)
// @route   POST /api/workflow/upload
// @access  Private (Admin only)
router.post('/upload', protect, authorizeRoles('admin'), upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ message: 'No file uploaded' });
    }
 
    const fileUrl = req.file.path.startsWith('http') 
      ? req.file.path 
      : `${req.protocol}://${req.get('host')}/uploads/${req.file.filename}`;
 
    res.json({ url: fileUrl });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// @desc    Create new document flow
// @route   POST /api/workflow
// @access  Private (Admin only)
router.post('/', protect, authorizeRoles('admin'), async (req, res) => {
  try {
    const { name, steps, isFormBased, requiredFields, elements, letterTemplate, includeLetterhead, includeRefDate, includeSeal, customHeaderUrl, customApprovedSealUrl, customRejectedSealUrl } = req.body;
    const flowExists = await DocumentType.findOne({ name });
    if (flowExists) {
      return res.status(400).json({ message: 'Document type already exists' });
    }
    const flow = await DocumentType.create({ 
      name, steps, isFormBased, requiredFields,
      elements: elements || [],
      letterTemplate: letterTemplate || '',
      includeLetterhead: includeLetterhead !== undefined ? includeLetterhead : true,
      includeRefDate: includeRefDate !== undefined ? includeRefDate : true,
      includeSeal: includeSeal !== undefined ? includeSeal : false,
      customHeaderUrl,
      customApprovedSealUrl,
      customRejectedSealUrl,
    });
    res.status(201).json(flow);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// @desc    Update document flow
// @route   PUT /api/workflow/:id
// @access  Private (Admin only)
router.put('/:id', protect, authorizeRoles('admin'), async (req, res) => {
  try {
    const { name, steps, isActive, isFormBased, requiredFields, elements, letterTemplate, includeLetterhead, includeRefDate, includeSeal, customHeaderUrl, customApprovedSealUrl, customRejectedSealUrl } = req.body;
    const flow = await DocumentType.findById(req.params.id);
    if (flow) {
      flow.name = name || flow.name;
      flow.steps = steps || flow.steps;
      if (isActive !== undefined) flow.isActive = isActive;
      if (isFormBased !== undefined) flow.isFormBased = isFormBased;
      if (requiredFields) flow.requiredFields = requiredFields;
      if (elements !== undefined) flow.elements = elements;
      if (letterTemplate !== undefined) flow.letterTemplate = letterTemplate;
      if (includeLetterhead !== undefined) flow.includeLetterhead = includeLetterhead;
      if (includeRefDate !== undefined) flow.includeRefDate = includeRefDate;
      if (includeSeal !== undefined) flow.includeSeal = includeSeal;
      if (customHeaderUrl !== undefined) flow.customHeaderUrl = customHeaderUrl;
      if (customApprovedSealUrl !== undefined) flow.customApprovedSealUrl = customApprovedSealUrl;
      if (customRejectedSealUrl !== undefined) flow.customRejectedSealUrl = customRejectedSealUrl;
      const updatedFlow = await flow.save();
      res.json(updatedFlow);
    } else {
      res.status(404).json({ message: 'Flow not found' });
    }
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// @desc    Delete document flow
// @route   DELETE /api/workflow/:id
// @access  Private (Admin only)
router.delete('/:id', protect, authorizeRoles('admin'), async (req, res) => {
  try {
    const flow = await DocumentType.findById(req.params.id);
    if (flow) {
      await flow.deleteOne();
      res.json({ message: 'Flow removed' });
    } else {
      res.status(404).json({ message: 'Flow not found' });
    }
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

module.exports = router;
