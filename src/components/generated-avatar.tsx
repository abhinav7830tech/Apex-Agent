import { createAvatar } from '@dicebear/core';
import { botttsNeutral, initials } from '@dicebear/collection';
import { cn } from "@/lib/utils";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";

interface GeneratedAvatarProps {
    seed: string;
    className?: string;
    size?: "sm" | "md" | "lg";
    variant?: "initials" | "botttsNeutral";
}

export const GeneratedAvatar = ({
    seed = '',
    className = '',
    size = "md",
    variant = "initials"
}: GeneratedAvatarProps) => {
    // For botttsNeutral variant
    if (variant === "botttsNeutral") {
        const avatarSvg = createAvatar(botttsNeutral, {
            seed: seed || 'default',
            size: 128,
            // Customize the avatar options as needed
            backgroundColor: ['b6e3f4', 'c0aede', 'd1d4f9', 'ffd5dc', 'ffdfbf'],
        });

        const sizeClasses = {
            sm: "h-8 w-8",
            md: "h-10 w-10",
            lg: "h-12 w-12"
        };

        return (
            <div className={cn("rounded-full overflow-hidden", sizeClasses[size], className)}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                    src={`data:image/svg+xml;utf8,${encodeURIComponent(avatarSvg.toString())}`}
                    alt={`Avatar for ${seed}`}
                    className="w-full h-full object-cover"
                />
            </div>
        );
    }

    // Default to initials avatar
    const getInitial = (name: string) => {
        if (!name) return 'A';
        return name.charAt(0).toUpperCase();
    };

    const initial = getInitial(seed);

    // Generate consistent color from seed
    let hash = 0;
    for (let i = 0; i < seed.length; i++) {
        hash = seed.charCodeAt(i) + ((hash << 5) - hash);
    }

    const colors = [
        'bg-blue-500', 'bg-green-500', 'bg-purple-500', 'bg-pink-500',
        'bg-orange-500', 'bg-teal-500', 'bg-indigo-500', 'bg-rose-500',
        'bg-amber-500', 'bg-emerald-500', 'bg-cyan-500', 'bg-fuchsia-500',
        'bg-violet-500', 'bg-sky-500', 'bg-lime-500', 'bg-yellow-500'
    ];

    const color = colors[Math.abs(hash) % colors.length];

    const sizeClasses = {
        sm: "h-8 w-8 text-sm",
        md: "h-10 w-10 text-base",
        lg: "h-12 w-12 text-lg"
    };

    return (
        <Avatar className={cn(
            "flex items-center justify-center rounded-full text-white font-medium",
            color,
            sizeClasses[size],
            className
        )}>
            <AvatarImage src={createAvatar(initials, { seed, fontWeight: 500, fontSize: 42 }).toDataUri()} alt={`Avatar for ${seed}`} />
            <AvatarFallback>
                {initial}
            </AvatarFallback>
        </Avatar>
    );
};