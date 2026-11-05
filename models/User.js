const mongoose = require('mongoose');
const bcrypt = require('bcrypt');

const UserSchema = new mongoose.Schema({
  username: {
    type: String,
    required: true,
    unique: true,
    trim: true,
    lowercase: true
  },
  password: {
    type: String,
    required: true
  },
  role: {
    type: String,
    enum: ['admin', 'employee'],
    default: 'employee'
  },
  empId: {
    type: String,
    default: null
  },
  name: {
    type: String,
    default: ''
  },
  active: {
    type: Boolean,
    default: true
  },
  // Granular permissions (extend as needed)
  permissions: {
    canViewOwnSlip: { type: Boolean, default: true },
    canViewAllSlips: { type: Boolean, default: false },
    canManageEmployees: { type: Boolean, default: false },
    canManageBusiness: { type: Boolean, default: false },
    canManageUsers: { type: Boolean, default: false }
  }
}, { timestamps: true });

// Mongoose 8 async hook — no `next` argument
UserSchema.pre('save', async function () {
  if (!this.isModified('password')) return;
  this.password = await bcrypt.hash(this.password, 12);
});

UserSchema.methods.comparePassword = function (candidate) {
  return bcrypt.compare(candidate, this.password);
};

module.exports = mongoose.model('User', UserSchema);