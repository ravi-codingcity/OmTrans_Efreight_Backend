const mongoose = require('mongoose');
const dotenv = require('dotenv');
const User = require('../models/User');

// Load env vars
dotenv.config();

// Default users to seed
const defaultUsers = [
  {
    username: 'vikram',
    password: '123',
    fullName: 'Vikram',
    role: 'Admin',
    location: 'Delhi',
  },
  {
    username: 'ravi',
    password: '123',
    fullName: 'Ravi',
    role: 'Manager',
    location: 'Mumbai',
  },
];

// Connect to database and seed users
const seedUsers = async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('MongoDB Connected for seeding...');

    // Drop old indexes that might conflict
    try {
      await mongoose.connection.collection('users').dropIndex('email_1');
      console.log('Dropped old email index');
    } catch (e) {
      // Index might not exist, that's okay
    }

    for (const userData of defaultUsers) {
      // Check if user already exists
      const existingUser = await User.findOne({ username: userData.username });

      if (existingUser) {
        console.log(`User '${userData.username}' already exists, skipping...`);
      } else {
        await User.create(userData);
        console.log(`User '${userData.username}' created successfully!`);
      }
    }

    console.log('\nSeeding completed!');
    console.log('\nDefault Users:');
    console.log('----------------------------');
    console.log('Username: vikram | Password: 123 | Role: Admin');
    console.log('Username: ravi   | Password: 123 | Role: Manager');
    console.log('----------------------------\n');

    process.exit(0);
  } catch (error) {
    console.error(`Error: ${error.message}`);
    process.exit(1);
  }
};

seedUsers();
