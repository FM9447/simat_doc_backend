const express = require('express');
const User = require('../models/User');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcrypt');
const { upload } = require('../config/cloudinary');
const { protect, authorizeRoles } = require('../middleware/authMiddleware');
const NotificationService = require('../services/notificationService');

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

    // Security: Prevent public registration as 'admin' or 'principal'
    let finalRole = role === 'teacher' ? 'tutor' : role;
    if (finalRole === 'admin' || finalRole === 'principal') {
      finalRole = 'student'; // Silently downgrade
    }

    const user = await User.create({
      name, email, password: hashedPassword, role: finalRole, 
      registerNo, dept, departmentId, tutorId, year, division
    });

    if (user) {
      res.status(201).json({
        _id: user.id, name: user.name, email: user.email, role: user.role, 
        dept: user.dept, departmentId: user.departmentId, tutorId: user.tutorId,
        year: user.year, division: user.division,
        signatureUrl: user.signatureUrl,
        isApproved: user.isApproved,
        delegatedTo: user.delegatedTo,
        token: generateToken(user.id),
      });

      // Notify Admin about new registration
      User.find({ role: 'admin' }).then(admins => {
        const message = `New user registration: ${user.name} (${user.role})`;
        admins.forEach(adminUser => {
          NotificationService.send(adminUser._id, message, 'info');
        });
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
        delegatedTo: user.delegatedTo,
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
  try {
    const user = await User.findById(req.user._id)
      .populate('departmentId', 'name')
      .populate('tutorId', 'name email')
      .populate('delegatedTo', 'name email role')
      .select('-password');
    res.json(user);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
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
    
    const populatedUser = await User.findById(updatedUser._id)
      .populate('departmentId', 'name')
      .populate('tutorId', 'name email')
      .populate('delegatedTo', 'name email role')
      .select('-password');
    
    res.json(populatedUser);
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

// @desc    Get colleagues (same role) for delegation
// @route   GET /api/auth/colleagues
// @access  Private
router.get('/colleagues', protect, async (req, res) => {
  try {
    let query = { _id: { $ne: req.user._id }, isApproved: true };
    const userRole = req.user.role;

    if (userRole === 'tutor') {
      // Tutors can delegate to fellow tutors in same dept
      query.role = 'tutor';
      query.departmentId = req.user.departmentId;
    } else if (userRole === 'hod') {
      // HODs can delegate to ANY tutor
      query.role = 'tutor';
    } else if (userRole === 'principal') {
      // Principals can delegate to other Principals or Office
      query.role = { $in: ['principal', 'office'] };
    } else if (userRole === 'office') {
      // Office can delegate to other Office staff
      query.role = 'office';
    } else {
      // For other roles, they cannot delegate to anyone
      return res.status(403).json({ message: 'This role is not allowed to delegate' });
    }

    const users = await User.find(query).select('name email role');
    res.json(users);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// @desc    Approve/Unapprove user (Admin only)
// @route   PUT /api/auth/users/:id/approve
router.put('/users/:id/approve', protect, authorizeRoles('admin'), async (req, res) => {
  try {
    const { isApproved } = req.body;
    const user = await User.findById(req.params.id);
    if (user) {
      user.isApproved = isApproved;
      await user.save();
      
      if (isApproved) {
        await NotificationService.send(user._id, 'Your account has been approved! You can now log in and use the system.', 'ok');
      }
      
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
    
    if (user.role === 'principal' && user.isApproved === true) {
      await User.updateMany(
        { _id: { $ne: user._id }, role: 'principal' },
        { $set: { isApproved: false } }
      );
    }
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

// @desc    Update FCM Token
// @route   POST /api/auth/fcm-token
// @access  Private
router.post('/fcm-token', protect, async (req, res) => {
  try {
    const { token } = req.body;
    if (!token) return res.status(400).json({ message: 'Token is required' });

    await User.updateMany(
      { fcmTokens: token, _id: { $ne: req.user._id } },
      { $pull: { fcmTokens: token } }
    );

    const user = await User.findById(req.user._id);
    if (!user.fcmTokens.includes(token)) {
      user.fcmTokens.push(token);
      await user.save();
    }
    res.json({ message: 'FCM Token updated and synchronized successfully' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// @desc    Set/Clear Role Delegation (Vacation Mode)
// @route   PUT /api/auth/delegate
// @access  Private
router.put('/delegate', protect, async (req, res) => {
  try {
    const { delegatedToId } = req.body;
    const Document = require('../models/Document');

    const user = await User.findById(req.user._id);
    if (!user) return res.status(404).json({ message: 'User not found' });

    if (delegatedToId) {
      const delegate = await User.findById(delegatedToId);
      if (!delegate) return res.status(404).json({ message: 'Delegate user not found' });
      
      // Role validation logic (updated per user request)
      let isValid = false;
      const uRole = user.role;
      const dRole = delegate.role;

      if (uRole === 'tutor' && dRole === 'tutor' && delegate.departmentId.toString() === user.departmentId.toString()) {
        isValid = true;
      } else if (uRole === 'hod' && dRole === 'tutor') {
        // HOD can delegate to ANY tutor
        isValid = true;
      } else if (uRole === 'principal' && (dRole === 'principal' || dRole === 'office')) {
        // Principal can delegate to another Principal or Office
        isValid = true;
      } else if (uRole === 'office' && dRole === 'office') {
        isValid = true;
      } else if (uRole === 'admin') {
        isValid = true;
      }

      if (!isValid) {
        return res.status(400).json({ message: `Invalid delegate: ${uRole.toUpperCase()} cannot delegate to ${dRole.toUpperCase()}${uRole === 'tutor' ? ' in a different department' : ''}` });
      }

      user.delegatedTo = delegatedToId;

      // Transfer CURRENT pending requests
      const documents = await Document.find({ 
        [`assigned.${user.role}.id`]: user._id,
        status: { $in: ['pending', 'partially_approved'] }
      });

      console.log(`Delegation: Transferring ${documents.length} documents from ${user.name} to ${delegate.name}`);

      for (const doc of documents) {
        // Update the assignment to the delegate's info
        doc.assigned[user.role] = { id: delegatedToId, name: delegate.name };
        doc.markModified('assigned');
        
        doc.approvals.push({
          approverId: user._id,
          role: user.role,
          action: 'forwarded',
          comment: `System: Auto-delegated to ${delegate.name} (Vacation Mode).`,
        });
        
        await doc.save();
        // Notify the delegate
        await NotificationService.send(delegatedToId, `Action Required: Document "${doc.title}" delegated to you from ${user.name}.`, 'info');
      }
    } else {
      user.delegatedTo = undefined;
    }

    await user.save();
    res.json({ message: 'Delegation settings updated successfully', delegatedTo: user.delegatedTo });
  } catch (error) {
    console.error('Delegation error:', error);
    res.status(500).json({ message: error.message });
  }
});

module.exports = router;
