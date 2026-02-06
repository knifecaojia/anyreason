import React from 'react';
import { ProjectCard } from '../components/ProjectCard';
import { PROJECTS } from '../constants';
import { Plus, Filter } from 'lucide-react';

export const ProjectList: React.FC = () => {
  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h2 className="text-xl font-semibold">我的项目 ({PROJECTS.length})</h2>
        <div className="flex gap-3">
          <button className="flex items-center gap-2 px-4 py-2 rounded-lg border border-border bg-surface hover:bg-surfaceHighlight text-textMuted transition-colors">
            <Filter size={16} />
            <span>筛选</span>
          </button>
          <button className="flex items-center gap-2 px-4 py-2 rounded-lg bg-primary hover:bg-blue-600 text-white font-medium shadow-lg shadow-blue-500/20 transition-all">
            <Plus size={18} />
            <span>新建剧集</span>
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
        {PROJECTS.map(project => (
          <div key={project.id} className="h-full">
            <ProjectCard project={project} />
          </div>
        ))}
        
        {/* Add New Placeholder Card */}
        <button className="group h-[380px] rounded-2xl border-2 border-dashed border-border hover:border-primary/50 flex flex-col items-center justify-center gap-4 text-textMuted hover:text-primary transition-all bg-surface/30 hover:bg-surface/50">
           <div className="w-16 h-16 rounded-full bg-surfaceHighlight group-hover:bg-primary/10 flex items-center justify-center transition-colors">
             <Plus size={32} />
           </div>
           <span className="font-medium">创建新项目</span>
        </button>
      </div>
    </div>
  );
};
