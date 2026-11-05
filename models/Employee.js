const mongoose = require('mongoose');

const EmployeeSchema = new mongoose.Schema({
  empId: { type: String, required: true, unique: true, trim: true },
  name: String,
  idNo: String,
  mobile: String,
  email: String,
  baseSalary: { type: Number, default: 6500 },
  lastUpdated: { type: Date, default: Date.now }
}, { timestamps: true });

module.exports = mongoose.model('Employee', EmployeeSchema);