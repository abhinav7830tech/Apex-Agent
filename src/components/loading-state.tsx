import { Loader2 } from "lucide-react";

interface LoadingStateProps {
  title?: string;
  description?: string;
  size?: "sm" | "md" | "lg";
}

export const LoadingState = ({ 
  title = "Loading ", 
  description = "This may take a moment...",
  size = "md" 
}: LoadingStateProps) => {
  const sizeClasses = {
    sm: "w-6 h-6",
    md: "w-8 h-8", 
    lg: "w-12 h-12"
  };

  const containerClasses = {
    sm: "gap-3",
    md: "gap-4",
    lg: "gap-6"
  };

  return (
    <div className={`flex flex-col items-center justify-center min-h-[200px] ${containerClasses[size]}`}>
      {/* Animated spinner */}
      <div className="relative">
        <Loader2 
          className={`${sizeClasses[size]} animate-spin text-red-500`}
        />
        {/* Optional: Add a subtle glow effect */}
        <div className={`absolute inset-0 ${sizeClasses[size]} animate-spin`}>
          <div className="w-full h-full rounded-full bg-red-500/20 blur-sm"></div>
        </div>
      </div>
      
      {/* Loading text */}
      <div className="text-center space-y-2">
        <h3 className="text-lg font-semibold text-white">
          {title}
        </h3>
        <p className="text-sm text-gray-400 max-w-sm">
          {description}
        </p>
      </div>
      
      {/* Optional: Progress dots animation */}
      <div className="flex space-x-1">
        <div className="w-2 h-2 bg-red-500/60 rounded-full animate-pulse"></div>
        <div className="w-2 h-2 bg-red-500/60 rounded-full animate-pulse" style={{ animationDelay: '0.2s' }}></div>
        <div className="w-2 h-2 bg-red-500/60 rounded-full animate-pulse" style={{ animationDelay: '0.4s' }}></div>
      </div>
    </div>
  );
};