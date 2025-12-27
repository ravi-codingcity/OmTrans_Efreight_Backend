const mongoose = require('mongoose');

const customSuggestionSchema = new mongoose.Schema(
  {
    type: {
      type: String,
      required: [true, 'Type is required'],
      enum: ['customer', 'consignee', 'pod', 'pol', 'por', 'airportDeparture', 'airportDestination'],
      trim: true,
    },
    // For simple types (pod, pol, por, airportDeparture, airportDestination)
    value: {
      type: String,
      trim: true,
      default: '',
    },
    // For customer/consignee types
    name: {
      type: String,
      trim: true,
      default: '',
    },
    address: {
      type: String,
      trim: true,
      default: '',
    },
    createdBy: {
      type: String,
      trim: true,
      default: '',
    },
  },
  {
    timestamps: true,
  }
);

// Compound unique indexes to prevent duplicates
// For simple types: type + value must be unique
customSuggestionSchema.index(
  { type: 1, value: 1 },
  { 
    unique: true, 
    partialFilterExpression: { 
      type: { $in: ['pod', 'pol', 'por', 'airportDeparture', 'airportDestination'] },
      value: { $ne: '' }
    } 
  }
);

// For customer/consignee: type + name must be unique
customSuggestionSchema.index(
  { type: 1, name: 1 },
  { 
    unique: true, 
    partialFilterExpression: { 
      type: { $in: ['customer', 'consignee'] },
      name: { $ne: '' }
    } 
  }
);

module.exports = mongoose.model('CustomSuggestion', customSuggestionSchema);
