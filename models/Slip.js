const mongoose = require('mongoose');

const CalendarDaySchema = new mongoose.Schema({
  date: String,
  status: { type: String, enum: ['Present', 'HalfDay', 'Absent', 'Paid', 'NA'] }
}, { _id: false });

const BonusSchema = new mongoose.Schema({
  name: String, amount: String, comment: String
}, { _id: false });

const SlipSchema = new mongoose.Schema({
  empId: { type: String, required: true, index: true },
  employeeName: String,
  month: { type: String, required: true, index: true },
  baseSalary: Number,
  calendar: [CalendarDaySchema],
  bonusEnabled: Boolean,
  bonusData: [BonusSchema],
  notes: String,
  version: { type: Number, default: 1 },
  isLatest: { type: Boolean, default: true },
  attendanceSummary: {
    present: Number, absent: Number, paid: Number, na: Number
  }
}, { timestamps: true });

SlipSchema.index({ empId: 1, month: 1, version: -1 });
SlipSchema.index({ empId: 1, month: 1, isLatest: 1 });

module.exports = mongoose.model('Slip', SlipSchema);