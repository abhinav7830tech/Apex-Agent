
import Image from "next/image";

interface LoadingStateProps {
  title?: string;
  description?: string;
  image?:string;
  
}

export const EmptyState = ({ 
  title = "Loading ", 
  description = "This may take a moment...",
  image="/empty.svg"
  
}: LoadingStateProps) => {
  
  return (
    <div className="flex flex-col items-center justify-center py-16">
      <Image src={image} alt="Empty" width={240} height={240} />
      <div className="flex flex-col gap-y-3 max-w-md mx-auto text-center">
        <h1 className="text-xl font-semibold text-slate-700">{title}</h1>
        <p className="text-sm text-green-500">{description}</p>
      </div>
    </div>
  );
};
