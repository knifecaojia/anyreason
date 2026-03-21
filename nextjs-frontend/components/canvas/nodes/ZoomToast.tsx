/**
 * 缩放比例提示组件
 * 显示当前缩放比例，自动消失
 */

import React, { memo } from 'react';
import { ZoomIn } from 'lucide-react';

interface ZoomToastProps {
  message: string;
}

const ZoomToast: React.FC<ZoomToastProps> = ({ message }) => {
  return (
    <div className="fixed inset-0 pointer-events-none z-[10002] flex items-center justify-center">
      <div 
        className="bg-black/80 text-white px-6 py-3 rounded-xl flex items-center gap-3 animate-in fade-in zoom-in duration-200"
        style={{
          backdropFilter: 'blur(8px)',
          boxShadow: '0 8px 32px rgba(0, 0, 0, 0.3)',
        }}
      >
        <ZoomIn size={20} className="text-accent" />
        <span className="text-lg font-semibold">{message}</span>
      </div>
    </div>
  );
};

export default memo(ZoomToast);
