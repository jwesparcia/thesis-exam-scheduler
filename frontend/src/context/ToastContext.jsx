import React, { createContext, useContext, useState, useCallback } from "react";

const ToastContext = createContext();

export const useToast = () => {
    const context = useContext(ToastContext);
    if (!context) {
        throw new Error("useToast must be used within a ToastProvider");
    }
    return context;
};

export const ToastProvider = ({ children }) => {
    const [toasts, setToasts] = useState([]);

    const removeToast = useCallback((id) => {
        setToasts((prevToasts) => prevToasts.filter((toast) => toast.id !== id));
    }, []);

    const addToast = useCallback((message, type = "info", duration = 4000) => {
        const id = Date.now();
        setToasts((prevToasts) => [...prevToasts, { id, message, type }]);

        setTimeout(() => {
            removeToast(id);
        }, duration);
    }, [removeToast]);

    const showSuccess = (message) => addToast(message, "success");
    const showError = (message) => addToast(message, "error");
    const showInfo = (message) => addToast(message, "info");
    const showWarning = (message) => addToast(message, "warning");

    return (
        <ToastContext.Provider value={{ showSuccess, showError, showInfo, showWarning }}>
            {children}
            <div className="fixed top-24 right-6 z-[100] flex flex-col gap-3 pointer-events-none items-end">
                {toasts.map((toast) => (
                    <ToastItem key={toast.id} {...toast} onClose={() => removeToast(toast.id)} />
                ))}
            </div>
        </ToastContext.Provider>
    );
};

const ToastItem = ({ message, type, onClose }) => {
    const getStyles = () => {
        switch (type) {
            case "success":
                return "bg-emerald-500 text-white border-emerald-600 shadow-[0_4px_12px_rgba(16,185,129,0.3)]";
            case "error":
                return "bg-red-500 text-white border-red-600 shadow-[0_4px_12px_rgba(239,68,68,0.3)]";
            case "warning":
                return "bg-amber-500 text-white border-amber-600 shadow-[0_4px_12px_rgba(245,158,11,0.3)]";
            default:
                return "bg-blue-600 text-white border-blue-700 shadow-[0_4px_12px_rgba(37,99,235,0.3)]";
        }
    };

    return (
        <div
            className={`
                ${getStyles()} 
                min-w-[300px] max-w-md p-4 rounded-xl border flex items-center justify-between gap-3 
                animate-slide-in pointer-events-auto cursor-default transform transition-all duration-300
            `}
        >
            <div className="flex items-center gap-3">
                <ToastIcon type={type} />
                <p className="text-sm font-medium">{message}</p>
            </div>
            <button onClick={onClose} className="hover:opacity-75 transition-opacity">
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
            </button>
        </div>
    );
};

const ToastIcon = ({ type }) => {
    switch (type) {
        case "success":
            return (
                <div className="bg-white/20 p-1.5 rounded-lg">
                    <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                </div>
            );
        case "error":
            return (
                <div className="bg-white/20 p-1.5 rounded-lg">
                    <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                </div>
            );
        case "warning":
            return (
                <div className="bg-white/20 p-1.5 rounded-lg">
                    <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                    </svg>
                </div>
            );
        default:
            return (
                <div className="bg-white/20 p-1.5 rounded-lg">
                    <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                </div>
            );
    }
};
