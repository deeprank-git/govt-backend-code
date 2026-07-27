import dns from "node:dns";
import mongoose, { mongo } from "mongoose";

// mongoDB_URL uses mongodb+srv://, which requires an SRV DNS lookup before
// mongoose can connect. The OS-configured resolver (often a router's DNS
// relay) can flakily refuse SRV-type queries even when A/AAAA lookups
// succeed — pin Node's resolver to a public DNS server known to handle it
// reliably, before mongoose.connect() ever runs.
dns.setServers(["8.8.8.8", "8.8.4.4"]);

const connectDB=async ()=>{
    try{
        await mongoose.connect(process.env.mongoDB_URL, { family: 4 });
        console.log("db connected successfully");
    }catch(error){
        console.log("connection failed:",error.message);
        process.exit(1);
    }
}

export default connectDB;