import { useEffect } from "react";
import { useNavigate } from "react-router-dom";

const withAuth = (WrappedComponent) => {
    const AuthComponent = (props) => {
        const router = useNavigate();

        const isAuthenticated = () => {
            return !!localStorage.getItem("token");
        };

        useEffect(() => {
            if (!isAuthenticated()) {
                router("/auth");
            }
        }, [router]);

        // FIXED: Do not render the protected component at all if no token exists
        if (!isAuthenticated()) {
            return null; 
        }

        return <WrappedComponent {...props} />;
    };

    return AuthComponent;
};

export default withAuth;