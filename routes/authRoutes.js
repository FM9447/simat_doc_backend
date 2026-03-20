const express = require('express');
const User = require('../models/User');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcrypt');
const { upload } = require('../config/cloudinary');
const { protect, authorizeRoles } = require('../middleware/authMiddleware');

const router = express.Router();

const generateToken = (id) => {
  return jwt.sign({ id }, process.env.JWT_SECRET, { expiresIn: '30d' });
};

// @desc    Register a new user
// @route   POST /api/auth/register
// @access  Public
router.post('/register', async (req, res) => {
  try {
    const { name, email, password, role, registerNo, dept, departmentId, tutorId, year, division } = req.body;

    const userExists = await User.findOne({ email });

    if (userExists) {
      console.log('Registration failed: User already exists', email);
      return res.status(400).json({ message: 'User already exists' });
    }

    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);

    const user = await User.create({
      name, email, password: hashedPassword, role: role === 'teacher' ? 'tutor' : role, 
      registerNo, dept, departmentId, tutorId, year, division
    });

    if (user) {
      res.status(201).json({
        _id: user.id, name: user.name, email: user.email, role: user.role, 
        dept: user.dept, departmentId: user.departmentId, tutorId: user.tutorId,
        year: user.year, division: user.division,
        signatureUrl: user.signatureUrl,
        isApproved: user.isApproved,
        token: generateToken(user.id),
      });
    } else {
      res.status(400).json({ message: 'Invalid user data' });
    }
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// @desc    Authenticate a user
// @route   POST /api/auth/login
// @access  Public
router.post('/login', async (req, res) => {
  try {
    console.log('Login attempt:', req.body.email);
    const { email, password } = req.body;
    const user = await User.findOne({ email });

    if (user && (await bcrypt.compare(password, user.password))) {
      if (!user.isApproved && user.role !== 'admin') {
        return res.status(401).json({ message: 'Your account is pending approval by an administrator.' });
      }
      res.json({
        _id: user.id, name: user.name, email: user.email, role: user.role, 
        dept: user.dept, departmentId: user.departmentId, tutorId: user.tutorId,
        year: user.year, division: user.division,
        signatureUrl: user.signatureUrl,
        isApproved: user.isApproved,
        token: generateToken(user.id),
      });
    } else {
      res.status(401).json({ message: 'Invalid credentials' });
    }
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// @desc    Get tutors by department
// @route   GET /api/auth/tutors?deptId=...
// @access  Public (Needed for registration)
router.get('/tutors', async (req, res) => {
  try {
    const { deptId } = req.query;
    console.log('DEBUG: Fetching tutors for dept:', deptId);
    const query = { role: 'tutor' }; 
    if (deptId) query.departmentId = deptId;
    
    const tutors = await User.find(query).select('name email _id');
    res.json(tutors);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// @desc    Get user profile
// @route   GET /api/auth/profile
// @access  Private
router.get('/profile', protect, async (req, res) => {
  const user = await User.findById(req.user._id)
    .populate('departmentId', 'name')
    .populate('tutorId', 'name email')
    .select('-password');
  res.json(user);
});

// @desc    Update user profile
// @route   PUT /api/auth/profile
// @access  Private
router.put('/profile', protect, async (req, res) => {
  try {
    const user = await User.findById(req.user._id);
    if (!user) return res.status(404).json({ message: 'User not found' });

    const { name, email, departmentId, tutorId, year, division } = req.body;
    
    if (name) user.name = name;
    if (email) user.email = email;
    if (departmentId !== undefined) user.departmentId = departmentId;
    if (tutorId !== undefined) user.tutorId = tutorId;
    if (year !== undefined) user.year = year;
    if (division !== undefined) user.division = division;

    const updatedUser = await user.save();
    
    res.json({
      _id: updatedUser.id,
      name: updatedUser.name,
      email: updatedUser.email,
      role: updatedUser.role,
      departmentId: updatedUser.departmentId,
      tutorId: updatedUser.tutorId,
      year: updatedUser.year,
      division: updatedUser.division,
      signatureUrl: updatedUser.signatureUrl,
      isApproved: updatedUser.isApproved
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// @desc    Change user password
// @route   PUT /api/auth/password
// @access  Private
router.put('/password', protect, async (req, res) => {
  try {
    const { oldPassword, newPassword } = req.body;
    const user = await User.findById(req.user._id);

    if (user && (await bcrypt.compare(oldPassword, user.password))) {
      const salt = await bcrypt.genSalt(10);
      user.password = await bcrypt.hash(newPassword, salt);
      await user.save();
      res.json({ message: 'Password updated successfully' });
    } else {
      res.status(401).json({ message: 'Invalid old password' });
    }
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// @desc    Upload digital signature
// @route   POST /api/auth/signature
// @access  Private
router.post('/signature', protect, upload.single('signature'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ message: 'No file uploaded' });
    }

    const fileUrl = req.file.path.startsWith('http') 
      ? req.file.path 
      : `${req.protocol}://${req.get('host')}/uploads/${req.file.filename}`;

    const user = await User.findById(req.user._id);
    user.signatureUrl = fileUrl;
    await user.save();

    res.json({ 
      message: 'Signature uploaded successfully',
      signatureUrl: fileUrl 
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// @desc    Get all users (Admin only)
// @route   GET /api/auth/users
router.get('/users', protect, authorizeRoles('admin'), async (req, res) => {
  try {
    const users = await User.find({})
      .select('-password')
      .populate('departmentId', 'name')
      .populate('tutorId', 'name');
    res.json(users);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// DELETE the old tutor route which was down here


// @desc    Approve/Unapprove user (Admin only)
// @route   PUT /api/auth/users/:id/approve
router.put('/users/:id/approve', protect, authorizeRoles('admin'), async (req, res) => {
  try {
    const { isApproved } = req.body;
    const user = await User.findById(req.params.id);
    if (user) {
      user.isApproved = isApproved;
      await user.save();
      res.json({ message: `User ${isApproved ? 'approved' : 'unapproved'} successfully` });
    } else {
      res.status(404).json({ message: 'User not found' });
    }
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// @desc    Update user properties (Admin only)
// @route   PUT /api/auth/users/:id
router.put('/users/:id', protect, authorizeRoles('admin'), async (req, res) => {
  try {
    const { role, dept, isApproved, departmentId, tutorId, year, division } = req.body;
    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ message: 'User not found' });

    if (role) user.role = role === 'teacher' ? 'tutor' : role;
    if (dept !== undefined) user.dept = dept;
    if (isApproved !== undefined) user.isApproved = isApproved;
    if (departmentId !== undefined) user.departmentId = departmentId;
    if (tutorId !== undefined) user.tutorId = tutorId;
    if (year !== undefined) user.year = year;
    if (division !== undefined) user.division = division;

    await user.save();
    res.json({ message: 'User updated successfully' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// @desc    Delete user (Admin only)
// @route   DELETE /api/auth/users/:id
router.delete('/users/:id', protect, authorizeRoles('admin'), async (req, res) => {
  try {
    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ message: 'User not found' });
    await user.deleteOne();
    res.json({ message: 'User removed successfully' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

module.exports = router;
