import { Github, Linkedin, Code, Server, Palette } from "lucide-react";
import Image from "next/image";
import Link from "next/link";

interface Developer {
  name: string;
  role: string;
  about: string;
  contributions: string[];
  photo: string;
  icon: typeof Code;
  github?: string;
  linkedin?: string;
}

const developers: Developer[] = [
  {
    name: "Abhinav Agnihotri",
    role: "Full Stack Developer & Project Lead",
    about:
      "Led the overall development of Apex Agent, coordinated the project architecture, and integrated AI-powered features across the platform.",
    contributions: [
      "Planned the complete project architecture",
      "Developed the frontend using Next.js, React, Tailwind CSS and shadcn/ui",
      "Implemented backend APIs and database integration",
      "Integrated AI features and workflow automation",
      "Designed dashboards, meeting management, and user experience",
      "Managed deployment, testing, debugging, and project integration",
    ],
    photo: "/dev1.jpg",
    icon: Code,
  },
  {
    name: "Aman Sharma",
    role: "Backend & AI Integration Developer",
    about:
      "Focused on backend services, AI integrations, and system functionality to ensure reliable performance.",
    contributions: [
      "Built backend APIs",
      "Integrated AI services and automation",
      "Implemented authentication and business logic",
      "Optimized database queries and performance",
      "Assisted in feature implementation and testing",
    ],
    photo: "/dev2.jpg",
    icon: Server,
  },
  {
    name: "Swati Saini",
    role: "Frontend Developer & UI/UX Designer",
    about:
      "Worked on creating clean, responsive, and user-friendly interfaces while improving the overall user experience.",
    contributions: [
      "Developed responsive UI components",
      "Improved layouts and user experience",
      "Designed reusable frontend components",
      "Assisted in integrating frontend with backend",
      "Performed UI testing and bug fixing",
    ],
    photo: "/dev3.jpg",
    icon: Palette,
  },
];

const roleColors = [
  "border-l-green-500",
  "border-l-blue-500",
  "border-l-purple-500",
];

function DeveloperCard({ developer, index }: { developer: Developer; index: number }) {
  const IconComponent = developer.icon;

  return (
    <div
      className={`group relative overflow-hidden rounded-2xl bg-white border border-gray-200 shadow-sm hover:shadow-md transition-all duration-200 hover:-translate-y-[1px] ${roleColors[index]}`}
    >
      <div className="p-8">
        <div className="flex flex-col items-center text-center mb-6">
          <div className="relative mb-4">
            <div className="w-28 h-28 rounded-full border-2 border-gray-200 overflow-hidden shadow-sm">
              <Image
                src={developer.photo}
                width={112}
                height={112}
                alt={developer.name}
                className="object-cover w-full h-full"
              />
            </div>
            <div className="absolute -bottom-1 -right-1 flex h-8 w-8 items-center justify-center rounded-full bg-white border border-gray-200 shadow-sm">
              <IconComponent className="h-4 w-4 text-gray-600" />
            </div>
          </div>
          <h3 className="text-lg font-semibold text-gray-900">{developer.name}</h3>
          <p className="text-sm font-medium text-green-600 mt-1">{developer.role}</p>
        </div>

        <p className="text-sm text-gray-600 leading-relaxed mb-6">{developer.about}</p>

        <div>
          <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">
            Key Contributions
          </h4>
          <ul className="space-y-2">
            {developer.contributions.map((contribution, i) => (
              <li key={i} className="flex items-start gap-2.5 text-sm text-gray-600">
                <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-green-500" />
                {contribution}
              </li>
            ))}
          </ul>
        </div>

        {(developer.github || developer.linkedin) && (
          <div className="flex items-center gap-3 mt-6 pt-6 border-t border-gray-100">
            {developer.github && (
              <Link
                href={developer.github}
                target="_blank"
                className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-900 transition-colors"
              >
                <Github className="h-4 w-4" />
                GitHub
              </Link>
            )}
            {developer.linkedin && (
              <Link
                href={developer.linkedin}
                target="_blank"
                className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-900 transition-colors"
              >
                <Linkedin className="h-4 w-4" />
                LinkedIn
              </Link>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export default function AboutDevelopersPage() {
  return (
    <div className="min-h-screen bg-[#FAFAFA]">
      <div className="max-w-6xl mx-auto px-6 py-16 md:py-24">
        {/* Header */}
        <div className="text-center mb-16">
          <div className="inline-flex items-center rounded-full border border-gray-200 bg-white px-4 py-1.5 text-xs font-medium text-gray-500 shadow-sm mb-6">
            Meet the Team
          </div>
          <h1 className="text-4xl md:text-5xl font-bold text-gray-900 tracking-tight mb-4">
            About Developers
          </h1>
          <p className="text-lg text-gray-500 max-w-2xl mx-auto">
            The people behind Apex Agent — building intelligent AI solutions to
            simplify productivity, meetings, and workflow management.
          </p>
        </div>

        {/* Developer Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-20">
          {developers.map((developer, index) => (
            <DeveloperCard key={developer.name} developer={developer} index={index} />
          ))}
        </div>

        {/* Divider */}
        <div className="border-t border-gray-200 my-12" />

        {/* Footer Section */}
        <div className="text-center">
          <h2 className="text-xl font-semibold text-gray-900 mb-3">
            Built with <span className="text-green-500">&#9829;</span> by Team Apex Agent
          </h2>
          <p className="text-gray-500 max-w-xl mx-auto">
            Creating intelligent AI solutions that simplify productivity, meetings, and workflow
            management.
          </p>
        </div>
      </div>
    </div>
  );
}
