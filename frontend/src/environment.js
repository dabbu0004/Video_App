// FIXED: Automatically detect if we are running in localhost or production
const IS_PROD = process.env.NODE_ENV === 'production';

const server = IS_PROD 
    ? "https://video-app-gcjc.onrender.com" 
    : "http://localhost:8000";
   
export default server;