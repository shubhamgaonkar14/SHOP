const mongoose = require('mongoose');

const SaleSchema = new mongoose.Schema({
  date: { type: String, required: true, index: true },
  total: Number,
  cash: Number,
  upi: Number,
  profit: Number,
  product: String,
  customer: String,
  note: String
}, { timestamps: true });

SaleSchema.index({ date: 1 });

module.exports = mongoose.model('Sale', SaleSchema);