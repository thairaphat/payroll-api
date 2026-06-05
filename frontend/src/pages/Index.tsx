// Index ไม่ใช้แล้ว — redirect ไป /dashboard ผ่าน App.tsx
import { Navigate } from "react-router-dom";
const Index = () => <Navigate to="/dashboard" replace />;
export default Index;
