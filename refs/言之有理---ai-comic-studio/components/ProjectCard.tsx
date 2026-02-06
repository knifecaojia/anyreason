import React from 'react';
import { Project } from '../types';
import { Users, FileStack, PlayCircle, MoreHorizontal } from 'lucide-react';

interface ProjectCardProps {
  project: Project;
}

export const ProjectCard: React.FC<ProjectCardProps> = ({ project }) => {
  const getStatusColor = (status: string) => {
    switch (status) {
      case 'PRODUCTION': return 'bg-blue-500/20 text-blue-400 border-blue-500/30';
      case 'PUBLISHED': return 'bg-green-500/20 text-green-400 border-green-500/30';
      case 'SCRIPTING': return 'bg-purple-500/20 text-purple-400 border-purple-500/30';
      default: return 'bg-gray-500/20 text-gray-400 border-gray-500/30';
    }
  };

  return (
    <div className="group bg-surface rounded-2xl overflow-hidden border border-border hover:border-primary/50 transition-all duration-300 hover:shadow-xl hover:shadow-primary/5 flex flex-col h-full">
      <div className="relative h-48 overflow-hidden">
        <img 
          src={project.coverImage} 
          alt={project.title} 
          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-700"
        />
        <div className="absolute top-3 left-3">
          <span className={`text-xs px-2 py-1 rounded-md border backdrop-blur-sm font-medium ${getStatusColor(project.status)}`}>
            {project.status}
          </span>
        </div>
        <div className="absolute inset-0 bg-gradient-to-t from-surface to-transparent opacity-80" />
        
        <div className="absolute bottom-3 right-3 opacity-0 group-hover:opacity-100 transition-opacity translate-y-2 group-hover:translate-y-0">
          <button className="bg-primary hover:bg-blue-600 text-white p-2 rounded-full shadow-lg">
            <PlayCircle size={20} fill="currentColor" />
          </button>
        </div>
      </div>
      
      <div className="p-5 flex-1 flex flex-col">
        <div className="flex justify-between items-start mb-2">
          <h3 className="text-lg font-bold text-textMain line-clamp-1 group-hover:text-primary transition-colors">
            {project.title}
          </h3>
          <button className="text-textMuted hover:text-textMain">
            <MoreHorizontal size={18} />
          </button>
        </div>
        
        <p className="text-sm text-textMuted mb-4 line-clamp-2 flex-1">
          {project.description}
        </p>
        
        <div className="flex items-center justify-between pt-4 border-t border-border/50 text-xs text-textMuted">
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-1.5" title="Episodes">
              <PlayCircle size={14} />
              <span>{project.episodes}集</span>
            </div>
            <div className="flex items-center gap-1.5" title="Team Size">
              <Users size={14} />
              <span>{project.teamSize}人</span>
            </div>
          </div>
          <span className="opacity-60">{project.updatedAt}</span>
        </div>
      </div>
    </div>
  );
};
