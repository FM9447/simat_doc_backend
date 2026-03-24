const express = require('express');
const router = express.Router();
const Feedback = require('../models/Feedback');
const { protect, authorizeRoles } = require('../middleware/authMiddleware');

// @desc    Submit feedback or report
// @route   POST /api/feedback
// @access  Private
router.post('/', protect, async (req, res) => {
  try {
    const { type, title, content } = req.body;
    
    if (!title || !content) {
      return res.status(400).json({ message: 'Title and content are required' });
    }

    const feedback = await Feedback.create({
      user: req.user._id,
      type: type || 'feedback',
      title,
      content
    });

    res.status(201).json(feedback);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// @desc    Get all feedback (Admin only)
// @route   GET /api/feedback
// @access  Private/Admin
router.get('/', protect, authorizeRoles('admin'), async (req, res) => {
  try {
    const feedbacks = await Feedback.find({})
      .populate('user', 'name email role')
      .sort({ createdAt: -1 });
    res.json(feedbacks);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

module.exports = router;
