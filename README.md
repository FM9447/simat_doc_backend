# SIMAT Smart Campus - Backend

This is the backend for the SIMAT Smart Campus Document Handler and Campus Management System.

## Features
- JWT Authentication & Role-Based Authorization
- Document Workflow Management (Request, Review, Approve, Reject)
- Digital Signature Integration
- Notification System
- Department and User Management

## Tech Stack
- **Runtime**: Node.js
- **Framework**: Express.js
- **Database**: MongoDB (Mongoose)
- **File Storage**: Cloudinary (for uploads and signatures)

## Setup
1. Clone the repository
2. Run `npm install`
3. Create a `.env` file with the following variables:
   - `PORT` (default 5000)
   - `MONGODB_URI`
   - `JWT_SECRET`
   - `CLOUDINARY_CLOUD_NAME`
   - `CLOUDINARY_API_KEY`
   - `CLOUDINARY_API_SECRET`
4. Run `npm run dev` to start the development server.
