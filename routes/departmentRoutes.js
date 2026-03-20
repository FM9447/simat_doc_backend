const express = require('express');
const router = express.Router();
const Department = require('../models/Department');
const User = require('../models/User');
const { protect, authorizeRoles } = require('../middleware/authMiddleware');

// @desc    Get all departments
// @route   GET /api/departments
// @access  Public
router.get('/', async (req, res) => {
  try {
    const depts = await Department.find({}).populate('hodId', 'name email');
    res.json(depts);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// @desc    Create a department
// @route   POST /api/departments
// @access  Private (Admin only)
router.post('/', protect, authorizeRoles('admin'), async (req, res) => {
  try {
    const { name } = req.body;
    const deptExists = await Department.findOne({ name });
    if (deptExists) return res.status(400).json({ message: 'Department already exists' });

    const dept = await Department.create({ name });
    res.status(201).json(dept);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// @desc    Assign HOD to department
// @route   PUT /api/departments/:id/hod
// @access  Private (Admin only)
router.put('/:id/hod', protect, authorizeRoles('admin'), async (req, res) => {
  try {
    const { hodId } = req.body;
    const dept = await Department.findById(req.params.id);
    if (!dept) return res.status(404).json({ message: 'Department not found' });

    const hod = await User.findById(hodId);
    if (!hod || hod.role !== 'hod') {
      return res.status(400).json({ message: 'User is not an HOD' });
    }

    // Remove status from old HOD if any
    if (dept.hodId) {
      await User.findByIdAndUpdate(dept.hodId, { hodOfDeptId: null });
    }

    // Update new HOD
    dept.hodId = hodId;
    await dept.save();
    
    hod.hodOfDeptId = dept._id;
    await hod.save();

    res.json({ message: 'HOD assigned successfully', dept });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// @desc    Delete department
// @route   DELETE /api/departments/:id
// @access  Private (Admin only)
router.delete('/:id', protect, authorizeRoles('admin'), async (req, res) => {
  try {
    const dept = await Department.findById(req.params.id);
    if (!dept) return res.status(404).json({ message: 'Department not found' });

    // Clear HOD status for the user
    if (dept.hodId) {
       await User.findByIdAndUpdate(dept.hodId, { hodOfDeptId: null });
    }

    await dept.deleteOne();
    res.json({ message: 'Department removed' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

module.exports = router;
