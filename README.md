# Quotation Dashboard - Backend API

Backend API for the Quotation Dashboard application built with the MERN stack (MongoDB, Express.js, React, Node.js).

## Features

- ✅ User Authentication (Register & Login)
- ✅ JWT-based Authorization
- ✅ Password Hashing with bcryptjs
- ✅ Protected Routes
- ✅ User Profile Management
- ✅ Error Handling Middleware
- ✅ CORS Configuration for React Frontend

## Tech Stack

- **Node.js** - JavaScript runtime
- **Express.js** - Web framework
- **MongoDB** - NoSQL database
- **Mongoose** - MongoDB ODM
- **JWT** - JSON Web Tokens for authentication
- **bcryptjs** - Password hashing

## Folder Structure

```
Backend/
├── src/
│   ├── config/
│   │   └── database.js         # MongoDB connection
│   ├── controllers/
│   │   └── authController.js   # Authentication logic
│   ├── middleware/
│   │   ├── auth.js             # JWT verification
│   │   └── errorHandler.js     # Global error handler
│   ├── models/
│   │   └── User.js             # User schema
│   ├── routes/
│   │   └── authRoutes.js       # Authentication routes
│   ├── utils/
│   │   └── generateToken.js    # JWT token generator
│   └── server.js               # Express app & server
├── .env                        # Environment variables
├── .env.example                # Environment template
├── .gitignore                  # Git ignore file
└── package.json                # Dependencies & scripts
```

## Installation

### Prerequisites

- Node.js (v14 or higher)
- MongoDB (local or Atlas)
- npm or yarn

### Setup Steps

1. **Install Dependencies**
   ```bash
   npm install
   ```

2. **Configure Environment Variables**
   
   Update the `.env` file with your configuration:
   ```env
   PORT=5000
   NODE_ENV=development
   MONGODB_URI=mongodb://localhost:27017/quotation_dashboard
   JWT_SECRET=your_secure_jwt_secret_key
   JWT_EXPIRE=7d
   CLIENT_URL=http://localhost:3000
   ```

3. **Start MongoDB**
   
   Make sure MongoDB is running locally or update the `MONGODB_URI` to point to your MongoDB Atlas cluster.

4. **Run the Server**
   
   Development mode (with nodemon):
   ```bash
   npm run dev
   ```
   
   Production mode:
   ```bash
   npm start
   ```

5. **Verify Server is Running**
   
   Navigate to `http://localhost:5000/api/health` - you should see:
   ```json
   {
     "success": true,
     "message": "Server is running",
     "timestamp": "2025-12-09T..."
   }
   ```

## API Endpoints

### Authentication Routes

#### Register User
```http
POST /api/auth/register
Content-Type: application/json

{
  "name": "John Doe",
  "email": "john@example.com",
  "password": "password123"
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "_id": "...",
    "name": "John Doe",
    "email": "john@example.com",
    "role": "user",
    "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
  }
}
```

#### Login User
```http
POST /api/auth/login
Content-Type: application/json

{
  "email": "john@example.com",
  "password": "password123"
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "_id": "...",
    "name": "John Doe",
    "email": "john@example.com",
    "role": "user",
    "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
  }
}
```

#### Get Current User (Protected)
```http
GET /api/auth/me
Authorization: Bearer <token>
```

**Response:**
```json
{
  "success": true,
  "data": {
    "_id": "...",
    "name": "John Doe",
    "email": "john@example.com",
    "role": "user",
    "isActive": true,
    "createdAt": "2025-12-09T..."
  }
}
```

#### Update Profile (Protected)
```http
PUT /api/auth/updateprofile
Authorization: Bearer <token>
Content-Type: application/json

{
  "name": "John Updated",
  "email": "johnupdated@example.com",
  "password": "newpassword123"
}
```

### Health Check
```http
GET /api/health
```

## Usage with React Frontend

In your React app, use the following pattern to interact with the API:

```javascript
// Login example
const login = async (email, password) => {
  const response = await fetch('http://localhost:5000/api/auth/login', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ email, password }),
  });
  const data = await response.json();
  
  if (data.success) {
    // Store token in localStorage
    localStorage.setItem('token', data.data.token);
  }
  return data;
};

// Protected request example
const getProfile = async () => {
  const token = localStorage.getItem('token');
  const response = await fetch('http://localhost:5000/api/auth/me', {
    headers: {
      'Authorization': `Bearer ${token}`,
    },
  });
  return await response.json();
};
```

## Security Features

- Password hashing with bcryptjs (10 salt rounds)
- JWT token authentication
- Protected routes middleware
- Input validation
- CORS configuration
- Environment variable protection

## Error Handling

The API uses a centralized error handler that returns consistent error responses:

```json
{
  "success": false,
  "message": "Error message here",
  "stack": "Stack trace (development only)"
}
```

## Next Steps

To extend this backend for your Quotation Dashboard, you can add:

1. **Quotation Model & Routes** - Create, read, update, delete quotations
2. **Customer Model** - Manage customer information
3. **Product/Service Model** - Manage items for quotations
4. **File Upload** - For quotation documents/PDFs
5. **Email Service** - Send quotations via email
6. **Dashboard Analytics** - Aggregate quotation data
7. **Role-based Access Control** - Different permissions for users/admins

## License

ISC

## Author

Your Name / OmTrans Freight
