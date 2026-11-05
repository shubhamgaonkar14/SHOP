const mongoose = require('mongoose');

const ExpenseSchema = new mongoose.Schema({
  date: { type: String, required: true, index: true },
  amount: Number,
  category: { type: String, index: true },
  description: String,
  paymentMode: { type: String, default: 'Cash' }
}, { timestamps: true });

ExpenseSchema.index({ date: 1 });

module.exports = mongoose.model('Expense', ExpenseSchema);