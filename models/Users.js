import mongoose from "mongoose";
import bcrypt from "bcrypt";

const UserSchema= new mongoose.Schema({
    name:{
        type: String,
        required:[true, 'Name is required'],
        trim: true
    },
    email:{
        type: String,
        required: [true,'Email is required'],
        unique: true,
        trim: true,
        lowercase: true
    },
    password:{
        type: String,
        required: [true, 'Password is required']
    },
    role:{
        type: String,
        required: [true, 'Role is required'],
        enum: ['student','instructor','admin'],
        default: 'student'
    },
    isActive:{
        type: Boolean,
        default: true
    },
    lastLogin:{
        type: Date,
    },
},{timestamps: true}
);


// Middleware: Automatically hash the password before saving it to the database
// Mongoose 9: pre("save") no longer receives a next() callback — the first
// arg is a SaveOptions object, so `return next()` would throw. Just return early instead.
UserSchema.pre('save', async function () {
  // Only hash the password if it has been modified or is new
  if (!this.isModified('password')) return;

  const salt = await bcrypt.genSalt(10);
  this.password = await bcrypt.hash(this.password, salt);
});

UserSchema.methods.comparePassword = async function (enteredPassword) {
   return await bcrypt.compare(enteredPassword, this.password);
};

const User=mongoose.model('User',UserSchema);
export default User;