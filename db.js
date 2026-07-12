import mongoose, { mongo } from "mongoose";

const connectDB=async ()=>{
    try{
        await mongoose.connect(process.env.mongoDB_URL);
        console.log("db connected successfully");
    }catch(error){
        console.log("connection failed:",error.message);
        process.exit(1);
    }
}

export default connectDB;