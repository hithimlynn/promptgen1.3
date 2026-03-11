import React, { useState, useRef, useEffect } from 'react';
import { 
  PenTool, 
  Image as ImageIcon, 
  Library, 
  Settings, 
  Copy, 
  Check, 
  Upload, 
  Loader2, 
  Sparkles, 
  Terminal, 
  Plus, 
  User, 
  Bot, 
  Send, 
  Trash2, 
  Edit2, 
  X, 
  ChevronDown, 
  Menu,
  MessageSquare,
  RefreshCw
} from 'lucide-react';

// --- 初始提示词框架数据 ---
const INITIAL_PROMPT_STRUCTURES = [
  {
    id: 'rtf',
    name: 'RTF 基础框架',
    category: '通用',
    description: 'Role-Task-Format: 经典的三位一体指令结构，适合大多数常规任务。',
    template: 'Role: [指定一个专业的角色]\nTask: [明确指出需要AI完成的具体任务]\nFormat: [明确输出的格式要求，如"分点列出"]'
  },
  {
    id: 'create',
    name: 'CREATE 深度框架',
    category: '创作',
    description: '适合复杂的长文创作、逻辑分析等，能给予大模型最全面的上下文约束。',
    template: 'Context: [背景信息]\nRequest: [核心请求]\nExplanation: [详细补充]\nAction: [具体步骤]\nTone: [语气风格]'
  },
  {
    id: 'mj_style',
    name: 'MJ 绘画结构',
    category: '设计',
    description: '标准且高效的 AI 绘画提示词结构，涵盖了从主体到光影、材质、渲染参数。',
    template: '[核心主体描述], [环境与背景细节], [光影与色彩氛围], [艺术风格], [视角参数], [画质词] --ar 16:9 --v 6.0'
  },
  {
    id: 'xhs',
    name: '小红书爆款',
    category: '社媒',
    description: '专为社交媒体打造的文案结构，强调标题吸引力、痛点场景共鸣。',
    template: '【吸引眼球的标题（加Emoji）】\n\n【痛点引入/场景共鸣】\n\n【核心干货/解决方案】\n\n【互动引导】\n\n#标签1 #标签2'
  }
];

// --- 核心 API 调用逻辑 (兼容 Gemini 与第三方 OpenAI 格式) ---
const callLLMAPI = async (messages, model, settings) => {
  let envKey = "";
  try {
    // 增加环境兼容性检查，防止编译报错
    if (typeof import.meta !== 'undefined' && import.meta.env) {
      envKey = import.meta.env.VITE_GEMINI_API_KEY || "";
    }
  } catch (e) {
    // 忽略环境不支持的情况
  }

  const apiKey = settings.key || envKey || ""; 
  let delay = 1000;
  
  for (let i = 0; i < 5; i++) {
    try {
      if (model.includes('gemini')) {
        const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
        const contents = messages.map(msg => {
          const parts = [{ text: msg.text }];
          if (msg.images && msg.images.length > 0) {
            msg.images.forEach(img => {
              parts.push({ inlineData: { mimeType: img.mimeType, data: img.base64 } });
            });
          }
          return { role: msg.role === 'assistant' ? 'model' : 'user', parts: parts };
        });
        
        const response = await fetch(url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ contents })
        });
        
        if (!response.ok) {
            const err = await response.json();
            throw new Error(err.error?.message || `API错误: ${response.status}`);
        }
        const data = await response.json();
        return data.candidates?.[0]?.content?.parts?.[0]?.text || "未生成内容";
      } else {
        // OpenAI 兼容模式 (适配 DashScope 等第三方)
        const isLocalDev = typeof window !== 'undefined' && 
                          (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1');
        
        // 在本地开发中需要API KEY，在Vercel上由后端提供
        if (isLocalDev && !apiKey) throw new Error("API_KEY_MISSING");
        
        // 在Vercel上使用后端API代理，本地使用代理
        const apiUrl = isLocalDev ? '/api/chat/completions' : '/api/chat';
        
        const openaiMessages = messages.map(msg => {
          let content = msg.text;
          if (msg.images && msg.images.length > 0) {
            content = [{ type: "text", text: msg.text }];
            msg.images.forEach(img => {
              content.push({ type: "image_url", image_url: { url: `data:${img.mimeType};base64,${img.base64}` } });
            });
          }
          return { role: msg.role, content: content };
        });

        const headers = {
          "Content-Type": "application/json"
        };
        
        // 在本地开发中添加Authorization header
        if (isLocalDev) {
          headers["Authorization"] = `Bearer ${apiKey}`;
        }

        const response = await fetch(apiUrl, {
          method: "POST",
          headers: headers,
          body: JSON.stringify({
            model: model,
            messages: openaiMessages
          })
        });

        if (!response.ok) throw new Error("API 请求失败，请检查配置与网络");
        const data = await response.json();
        return data.choices?.[0]?.message?.content || "未生成内容";
      }
    } catch (e) {
      if (e.message === "API_KEY_MISSING") throw new Error("请先在左侧设置中配置 API Key。");
      if (i === 4) throw e;
      await new Promise(r => setTimeout(r, delay));
      delay *= 2;
    }
  }
};

export default function App() {
  const [activeTab, setActiveTab] = useState('text-to-prompt');
  const [structures, setStructures] = useState(INITIAL_PROMPT_STRUCTURES);
  const [selectedModel, setSelectedModel] = useState('qwen3.5-plus');
  const [apiSettings, setApiSettings] = useState({ key: 'sk-sp-5ec93b5673844400855b03db10156bbb', baseUrl: '/api' });
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [chatSessionId, setChatSessionId] = useState(() => Date.now().toString()); 
  
  // 历史记录状态管理
  const [sessions, setSessions] = useState(() => {
    try {
      const saved = localStorage.getItem('promptgen_sessions');
      return saved ? JSON.parse(saved) : [];
    } catch(e) { return []; }
  });

  const handleNewChat = () => {
    setChatSessionId(Date.now().toString());
    setActiveTab('text-to-prompt');
    setIsMobileMenuOpen(false);
  };

  const handleUpdateSession = (id, title) => {
    setSessions(prev => {
      const existing = prev.find(s => s.id === id);
      if (existing && existing.title === title) return prev;
      const newSessions = existing 
        ? prev.map(s => s.id === id ? { ...s, title, updatedAt: Date.now() } : s)
        : [{ id, title, updatedAt: Date.now() }, ...prev];
      return newSessions.sort((a,b) => b.updatedAt - a.updatedAt);
    });
  };

  useEffect(() => {
    localStorage.setItem('promptgen_sessions', JSON.stringify(sessions));
  }, [sessions]);

  const handleDeleteSession = (id, e) => {
    e.stopPropagation();
    setSessions(prev => prev.filter(s => s.id !== id));
    localStorage.removeItem('promptgen_chat_' + id);
    if (chatSessionId === id) handleNewChat();
  };

  // 侧边栏组件
  const SidebarContent = () => (
    <div className="flex flex-col h-full bg-[#F2F2F7]">
      <div className="p-4 pt-8">
        <div className="flex items-center gap-2 px-2 mb-6">
          <div className="w-9 h-9 bg-[#007AFF] rounded-xl flex items-center justify-center shadow-md">
            <Sparkles size={22} className="text-white" />
          </div>
          <span className="font-bold text-xl tracking-tight text-gray-900">PromptGen</span>
        </div>
        <button onClick={handleNewChat} className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-white border border-[#E5E5EA] rounded-[14px] hover:bg-gray-50 shadow-sm text-[15px] font-semibold text-[#007AFF] mb-6 transition-all active:scale-[0.98]">
          <Plus size={18} /> 开启新对话
        </button>
      </div>

      <nav className="flex-1 overflow-y-auto space-y-1 px-3 custom-scrollbar pb-4">
        <div className="px-3 py-1 text-[11px] font-bold text-gray-400 uppercase tracking-widest mb-1">功能导航</div>
        <SidebarItem icon={<PenTool size={18} />} label="对话生成" active={activeTab === 'text-to-prompt'} onClick={() => { setActiveTab('text-to-prompt'); setIsMobileMenuOpen(false); }} />
        <SidebarItem icon={<ImageIcon size={18} />} label="视觉解析" active={activeTab === 'image-to-prompt'} onClick={() => { setActiveTab('image-to-prompt'); setIsMobileMenuOpen(false); }} />
        <SidebarItem icon={<Library size={18} />} label="提示词库" active={activeTab === 'library'} onClick={() => { setActiveTab('library'); setIsMobileMenuOpen(false); }} />

        {sessions.length > 0 && (
          <div className="mt-8">
            <div className="px-3 py-1 text-[11px] font-bold text-gray-400 uppercase tracking-widest mb-1">历史记录</div>
            <div className="space-y-0.5 px-1">
              {sessions.map(session => (
                <div key={session.id} onClick={() => { setChatSessionId(session.id); setActiveTab('text-to-prompt'); setIsMobileMenuOpen(false); }} className={`group flex items-center justify-between px-3 py-2.5 rounded-xl cursor-pointer transition-all ${chatSessionId === session.id && activeTab === 'text-to-prompt' ? 'bg-white shadow-sm text-[#007AFF]' : 'text-gray-600 hover:bg-[#E5E5EA]'}`}>
                  <div className="flex items-center gap-2 overflow-hidden">
                    <MessageSquare size={14} className="flex-shrink-0" />
                    <span className="text-[13px] font-medium truncate">{session.title}</span>
                  </div>
                  <button onClick={(e) => handleDeleteSession(session.id, e)} className="opacity-0 group-hover:opacity-100 p-1 text-gray-400 hover:text-red-500 rounded-lg hover:bg-gray-100"><Trash2 size={14} /></button>
                </div>
              ))}
            </div>
          </div>
        )}
      </nav>

      <div className="p-4 mb-2">
        <div onClick={() => { setIsSettingsOpen(true); setIsMobileMenuOpen(false); }} className="flex items-center gap-3 px-3 py-3 rounded-xl hover:bg-gray-200/60 transition-colors cursor-pointer text-[14px] font-semibold text-gray-700">
          <Settings size={18} className="text-gray-400" />
          <div className="flex-1 truncate">接口配置</div>
          <ChevronDown size={14} className="text-gray-300" />
        </div>
      </div>
    </div>
  );

  return (
    <div className="flex h-screen bg-white text-gray-900 font-sans antialiased">
      {/* PC 端侧边栏 */}
      <aside className="w-[280px] border-r border-[#E5E5EA] flex-col hidden md:flex z-10"><SidebarContent /></aside>
      
      {/* 移动端侧边栏 */}
      {isMobileMenuOpen && (
        <div className="fixed inset-0 z-50 flex md:hidden">
          <div className="fixed inset-0 bg-black/40 backdrop-blur-sm" onClick={() => setIsMobileMenuOpen(false)}></div>
          <aside className="relative w-[280px] h-full bg-[#F2F2F7] flex flex-col shadow-2xl animate-in slide-in-from-left duration-300"><SidebarContent /></aside>
        </div>
      )}
      
      {/* 主界面 */}
      <main className="flex-1 flex flex-col relative overflow-hidden">
        <header className="absolute top-0 w-full h-14 bg-white/80 backdrop-blur-md border-b border-[#E5E5EA] z-30 flex items-center justify-between px-4">
          <div className="flex items-center gap-3">
            <button className="md:hidden text-gray-700" onClick={() => setIsMobileMenuOpen(true)}><Menu size={22} /></button>
            <div className="hidden md:block font-bold text-gray-900 tracking-tight text-[15px]">
              {activeTab === 'text-to-prompt' ? '对话式提示词生成' : activeTab === 'image-to-prompt' ? '视觉提示词反推' : '专属框架管理库'}
            </div>
          </div>
          <ModelSelector selectedModel={selectedModel} setSelectedModel={setSelectedModel} />
        </header>

        <div className="flex-1 overflow-hidden pt-14 text-gray-800">
          {activeTab === 'text-to-prompt' && (
            <TextChatView 
              key={`text-${chatSessionId}`} 
              sessionId={chatSessionId} 
              onUpdateSession={handleUpdateSession} 
              structures={structures} 
              selectedModel={selectedModel} 
              apiSettings={apiSettings} 
            />
          )}
          {activeTab === 'image-to-prompt' && (
            <ImageChatView key={`img-view`} selectedModel={selectedModel} apiSettings={apiSettings} />
          )}
          {activeTab === 'library' && (
            <LibraryView structures={structures} setStructures={setStructures} />
          )}
        </div>
      </main>

      {/* 设置弹窗 */}
      {isSettingsOpen && (
        <SettingsModal settings={apiSettings} setSettings={setApiSettings} onClose={() => setIsSettingsOpen(false)} />
      )}
    </div>
  );
}

function SidebarItem({ icon, label, active, onClick }) {
  return (
    <button onClick={onClick} className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-[12px] transition-all text-[14px] font-semibold ${active ? 'bg-white shadow-sm text-[#007AFF]' : 'text-gray-600 hover:bg-[#E5E5EA]'}`}>
      {icon}<span>{label}</span>
    </button>
  );
}

function ModelSelector({ selectedModel, setSelectedModel }) {
  return (
    <div className="relative inline-flex items-center">
      <select value={selectedModel} onChange={(e) => setSelectedModel(e.target.value)} className="appearance-none bg-[#F2F2F7] border border-[#E5E5EA] text-gray-700 py-1.5 pl-3 pr-8 rounded-full text-[12px] font-bold focus:outline-none focus:ring-2 focus:ring-blue-500/20 shadow-sm cursor-pointer hover:bg-[#E5E5EA] transition-all">
        <optgroup label="千问 (Qwen)">
          <option value="qwen3.5-plus">qwen3.5-plus</option>
          <option value="qwen3-max-2026-01-23">qwen3-max-2026-01-23</option>
          <option value="qwen3-coder-next">qwen3-coder-next</option>
          <option value="qwen3-coder-plus">qwen3-coder-plus</option>
        </optgroup>
        <optgroup label="智谱 (GLM)">
          <option value="glm-5">glm-5</option>
          <option value="glm-4.7">glm-4.7</option>
        </optgroup>
        <optgroup label="Kimi / MiniMax">
          <option value="kimi-k2.5">kimi-k2.5</option>
          <option value="MiniMax-M2.5">MiniMax-M2.5</option>
        </optgroup>
        <optgroup label="Google">
          <option value="gemini-2.5-flash-preview-09-2025">Gemini 2.5 Flash</option>
        </optgroup>
      </select>
      <ChevronDown size={14} className="absolute right-2.5 text-gray-500 pointer-events-none" />
    </div>
  );
}

function SettingsModal({ settings, setSettings, onClose }) {
  const [localSettings, setLocalSettings] = useState(settings);
  const handleSave = () => { setSettings(localSettings); onClose(); };
  return (
    <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-white border border-white/20 w-full max-w-md rounded-[28px] shadow-2xl overflow-hidden animate-in zoom-in duration-200">
        <div className="px-6 py-5 border-b border-gray-100 flex justify-between items-center text-gray-800">
          <h2 className="font-bold text-lg text-gray-900">接口配置</h2>
          <button onClick={onClose} className="p-1.5 bg-gray-100 hover:bg-gray-200 rounded-full text-gray-500 transition-colors"><X size={18}/></button>
        </div>
        <div className="p-6 space-y-5">
           <div className="p-3.5 bg-blue-50 text-blue-700 rounded-2xl text-[12px] leading-relaxed border border-blue-100 shadow-inner">
             请根据您选择的模型提供商填写对应的 API 地址。若使用第三方平台，需使用 OpenAI 兼容格式。
           </div>
           <div className="space-y-1.5">
             <label className="text-[11px] font-bold text-gray-400 uppercase tracking-wider ml-1">API Base URL</label>
             <input value={localSettings.baseUrl} onChange={e => setLocalSettings({...localSettings, baseUrl: e.target.value})} placeholder="例如：https://api.codingplan.com/v1" className="w-full border border-gray-200 bg-gray-50 rounded-[14px] p-3.5 text-sm focus:ring-2 focus:ring-blue-500/20 focus:bg-white outline-none transition-all text-gray-800" />
           </div>
           <div className="space-y-1.5">
             <label className="text-[11px] font-bold text-gray-400 uppercase tracking-wider ml-1">API Key</label>
             <input type="password" value={localSettings.key} onChange={e => setLocalSettings({...localSettings, key: e.target.value})} placeholder="填入 API 密钥" className="w-full border border-gray-200 bg-gray-50 rounded-[14px] p-3.5 text-sm focus:ring-2 focus:ring-blue-500/20 focus:bg-white outline-none transition-all text-gray-800" />
           </div>
           <button onClick={handleSave} className="w-full py-4 bg-[#007AFF] text-white font-bold rounded-[16px] shadow-lg hover:bg-blue-600 transition-all active:scale-[0.98]">保存设置</button>
        </div>
      </div>
    </div>
  );
}

// ==========================================
// 模块 1: 对话生成逻辑 (修复了作用域及环境错误)
// ==========================================
function TextChatView({ sessionId, onUpdateSession, structures, selectedModel, apiSettings }) {
  const [topic, setTopic] = useState('');
  const [selectedId, setSelectedId] = useState(structures[0]?.id || '');
  const [isGenerating, setIsGenerating] = useState(false);
  const [chatItems, setChatItems] = useState([]);
  const [attachedImages, setAttachedImages] = useState([]);
  const fileInputRef = useRef(null);
  const scrollRef = useRef(null);

  useEffect(() => {
    try {
      const saved = localStorage.getItem('promptgen_chat_' + sessionId);
      setChatItems(saved ? JSON.parse(saved).map(i => ({ ...i, loading: false })) : []);
    } catch(e) { setChatItems([]); }
    setTopic(''); setAttachedImages([]); setIsGenerating(false);
  }, [sessionId]);

  useEffect(() => {
    if (chatItems.length > 0) {
      localStorage.setItem('promptgen_chat_' + sessionId, JSON.stringify(chatItems));
      const firstUser = chatItems.find(m => m.role === 'user');
      if (firstUser) {
        const title = (firstUser.content || "对话记录").slice(0, 15);
        onUpdateSession(sessionId, title);
      }
    }
  }, [chatItems, sessionId, onUpdateSession]);

  useEffect(() => { 
    if (scrollRef.current) scrollRef.current.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' }); 
  }, [chatItems, attachedImages]);

  const processImages = (files) => {
    if (!files || files.length === 0) return;
    const newImages = [];
    let processed = 0;
    const array = Array.from(files).filter(f => f.type.startsWith('image/'));
    array.forEach(file => {
      const reader = new FileReader();
      reader.onloadend = () => {
        newImages.push({ id: Math.random().toString(36).substr(2, 9), base64: reader.result.split(',')[1], mimeType: file.type, preview: URL.createObjectURL(file) });
        processed++;
        if (processed === array.length) setAttachedImages(prev => [...prev, ...newImages]);
      };
      reader.readAsDataURL(file);
    });
  };

  const handlePaste = (e) => {
    const items = e.clipboardData.items;
    const images = [];
    for (let i = 0; i < items.length; i++) { if (items[i].type.indexOf('image') !== -1) images.push(items[i].getAsFile()); }
    if (images.length > 0) { processImages(images); e.preventDefault(); }
  };

  const handleSend = async () => {
    if ((!topic.trim() && attachedImages.length === 0) || isGenerating) return;
    
    const structure = structures.find(s => s.id === selectedId);
    const isFirst = chatItems.length === 0;
    const apiPrompt = isFirst 
      ? `你是一个专业的提示词架构师。请根据主题：【${topic || '参考提供的图片'}】，按照框架：【${structure?.name}】模板：\n${structure?.template}\n生成高质量提示词。请直接输出最终可用的提示词，不要包含多余解释。` 
      : topic;
    
    const userMsg = { role: 'user', content: topic, apiPrompt, structure: isFirst ? structure?.name : null, images: [...attachedImages] };
    const newList = [...chatItems, userMsg];
    setChatItems(newList);
    setTopic(''); setAttachedImages([]); setIsGenerating(true);
    
    const aiId = Date.now();
    setChatItems(prev => [...prev, { role: 'assistant', displayContent: '', id: aiId, loading: true }]);
    
    try {
      const validHistory = newList.map(item => ({ 
        role: item.role, 
        text: item.role === 'user' ? item.apiPrompt : item.displayContent, 
        images: item.images || [] 
      }));
      const aiResponse = await callLLMAPI(validHistory, selectedModel, apiSettings);
      simulateStreaming(aiId, aiResponse);
    } catch (e) {
      setChatItems(prev => prev.map(item => item.id === aiId ? { ...item, displayContent: `请求错误: ${e.message}`, loading: false, error: true } : item));
      setIsGenerating(false);
    }
  };

  // 重生成逻辑放在了内部，作用域正常
  const handleRegenerate = async (aiMsgId) => {
    if (isGenerating) return;
    const aiIndex = chatItems.findIndex(item => item.id === aiMsgId);
    if (aiIndex === -1) return;

    setIsGenerating(true);
    setChatItems(prev => prev.map(item => item.id === aiMsgId ? { ...item, displayContent: '', loading: true, error: false } : item));

    try {
      const historyUntilBefore = chatItems.slice(0, aiIndex);
      const apiMessages = historyUntilBefore.map(i => ({
        role: i.role,
        text: i.role === 'user' ? i.apiPrompt : i.displayContent,
        images: i.images || []
      }));
      const res = await callLLMAPI(apiMessages, selectedModel, apiSettings);
      simulateStreaming(aiMsgId, res);
    } catch (e) {
      setChatItems(prev => prev.map(item => item.id === aiMsgId ? { ...item, displayContent: `重试失败: ${e.message}`, loading: false, error: true } : item));
      setIsGenerating(false);
    }
  };

  const simulateStreaming = (id, fullText) => {
    let idx = 0;
    setChatItems(prev => prev.map(i => i.id === id ? { ...i, loading: false, isStreaming: true } : i));
    const timer = setInterval(() => {
      setChatItems(prev => prev.map(item => {
        if (item.id === id) {
          const next = idx + Math.floor(Math.random() * 5) + 3;
          if (next >= fullText.length) { 
            clearInterval(timer); 
            setIsGenerating(false); 
            return { ...item, displayContent: fullText, isStreaming: false }; 
          }
          idx = next; return { ...item, displayContent: fullText.slice(0, idx) };
        }
        return item;
      }));
    }, 20);
  };

  return (
    <div className="flex flex-col h-full relative">
      <div ref={scrollRef} className="flex-1 overflow-y-auto custom-scrollbar pb-52 px-4 md:px-8 pt-8">
        {chatItems.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-center max-w-2xl mx-auto animate-in fade-in duration-700">
            <div className="w-20 h-20 bg-blue-50 rounded-[32px] flex items-center justify-center mb-8 shadow-sm text-[#007AFF]"><Sparkles size={42} /></div>
            <h1 className="text-[26px] font-bold mb-3 tracking-tight">AI 提示词创作中心</h1>
            <p className="text-gray-400 mb-10 text-sm leading-relaxed px-10">选择预设框架，输入需求或粘贴参考图。系统将自动调用大模型为您规划高质量提示词。</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5 w-full px-2">
              {structures.map(s => (
                <div key={s.id} onClick={() => setSelectedId(s.id)} className={`p-4 rounded-[22px] border transition-all cursor-pointer text-left ${selectedId === s.id ? 'bg-blue-50 border-blue-200 shadow-sm' : 'bg-white border-[#E5E5EA] hover:border-gray-300'}`}>
                  <div className={`font-bold mb-1 flex items-center gap-2 text-[15px] ${selectedId === s.id ? 'text-[#007AFF]' : 'text-gray-800'}`}>{s.name}{selectedId === s.id && <Check size={14} />}</div>
                  <p className="text-gray-400 text-[11px] leading-relaxed line-clamp-2">{s.description}</p>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <div className="max-w-3xl mx-auto w-full py-6 flex flex-col gap-8">
            {chatItems.map((item, idx) => (
              <div key={idx} className={`w-full flex flex-col ${item.role === 'user' ? 'items-end' : 'items-start'}`}>
                <div className={`flex flex-col ${item.role === 'user' ? 'items-end' : 'items-start'} max-w-[90%]`}>
                  {item.role === 'user' && (
                    <>
                      {item.structure && <div className="text-[11px] text-gray-400 font-bold mb-2 flex items-center gap-1.5 px-1 uppercase tracking-widest"><Terminal size={12} /> {item.structure}</div>}
                      {item.images?.length > 0 && <div className="mb-3 flex flex-wrap gap-2 justify-end">{item.images.map(img => <img key={img.id} src={img.preview || `data:${img.mimeType};base64,${img.base64}`} className="max-w-[130px] max-h-[130px] rounded-xl border border-[#E5E5EA] object-cover shadow-sm" />)}</div>}
                    </>
                  )}
                  {(item.content || item.loading || item.displayContent) && (
                    <div className={`px-4 py-2.5 text-[15px] leading-relaxed shadow-sm rounded-[20px] ${item.role === 'user' ? 'bg-[#007AFF] text-white rounded-br-[4px]' : 'bg-[#F2F2F7] text-gray-800 rounded-bl-[4px] border border-gray-100'}`}>
                      {item.loading ? <div className="flex items-center gap-2 text-gray-500 py-1"><Loader2 className="animate-spin" size={16} /> 思考中...</div> : <div className="whitespace-pre-wrap break-words">{item.role === 'user' ? item.content : item.displayContent}{item.isStreaming && <span className="inline-block w-2 h-4 ml-1 bg-[#007AFF] animate-pulse align-middle rounded-full"></span>}</div>}
                    </div>
                  )}
                  {item.role === 'assistant' && !item.loading && !item.isStreaming && (
                    <div className="flex items-center gap-4 mt-2.5 px-1 animate-in fade-in slide-in-from-top-1">
                      <CopyButton text={item.displayContent} />
                      <button onClick={() => handleRegenerate(item.id)} disabled={isGenerating} className="flex items-center gap-1.5 text-gray-400 hover:text-[#007AFF] text-[12px] font-bold transition-colors"><RefreshCw size={12} /> 重试</button>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="absolute bottom-0 left-0 w-full bg-white/90 backdrop-blur-xl border-t border-[#E5E5EA] pt-3 pb-8 px-4 md:px-8 z-20 shadow-lg">
        <div className="max-w-3xl mx-auto flex flex-col gap-3">
          {chatItems.length === 0 && (
            <div className="flex gap-2 overflow-x-auto no-scrollbar items-center pb-0.5">
              {structures.map(s => <button key={s.id} onClick={() => setSelectedId(s.id)} className={`flex-shrink-0 px-4 py-1.5 rounded-full text-[12px] font-bold border shadow-sm transition-all ${selectedId === s.id ? 'bg-blue-50 border-blue-200 text-[#007AFF]' : 'bg-white border-[#E5E5EA] text-gray-500 hover:bg-gray-100'}`}>{s.name}</button>)}
            </div>
          )}
          <div className="relative flex flex-col bg-white border border-[#E5E5EA] rounded-[24px] shadow-sm focus-within:ring-4 focus-within:ring-blue-500/5 transition-all overflow-hidden">
            {attachedImages.length > 0 && (
              <div className="px-4 pt-4 pb-1 flex gap-2.5 overflow-x-auto custom-scrollbar">
                {attachedImages.map(img => (
                  <div key={img.id} className="relative inline-block flex-shrink-0 group">
                    <img src={img.preview || `data:${img.mimeType};base64,${img.base64}`} className="h-16 w-16 rounded-[14px] object-cover border border-gray-100 shadow-sm" />
                    <button onClick={() => setAttachedImages(prev => prev.filter(i => i.id !== img.id))} className="absolute -top-2 -right-2 bg-gray-600 text-white rounded-full p-1 shadow-md hover:bg-red-500 transition-all"><X size={10} strokeWidth={3}/></button>
                  </div>
                ))}
              </div>
            )}
            <div className="flex items-end p-2">
              <button onClick={() => fileInputRef.current?.click()} className="p-2.5 text-gray-400 hover:text-[#007AFF] transition-all rounded-full hover:bg-gray-100">
                <Plus size={22} /><input type="file" multiple ref={fileInputRef} onChange={(e) => { processImages(e.target.files); e.target.value = ''; }} className="hidden" accept="image/*" />
              </button>
              <textarea value={topic} onChange={(e) => setTopic(e.target.value)} onPaste={handlePaste} onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); } }} placeholder={chatItems.length > 0 ? "连续对话补充要求..." : "输入需求或粘贴垫图(Ctrl+V)..."} className="w-full bg-transparent py-3 px-2 focus:outline-none text-[16px] resize-none max-h-[140px] overflow-y-auto leading-relaxed text-gray-800 placeholder-gray-400" rows={1} />
              <button onClick={handleSend} disabled={(!topic.trim() && attachedImages.length === 0) || isGenerating} className={`p-2 m-0.5 rounded-full flex-shrink-0 transition-all ${(topic.trim() || attachedImages.length > 0) && !isGenerating ? 'bg-[#007AFF] text-white shadow-md hover:bg-blue-600' : 'bg-gray-100 text-gray-300'}`}>{isGenerating ? <Loader2 size={20} className="animate-spin" /> : <Send size={20} />}</button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ==========================================
// 模块 2: 独立视觉解析
// ==========================================
function ImageChatView({ selectedModel, apiSettings }) {
  const [attached, setAttached] = useState([]);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState('');
  const [isStreaming, setIsStreaming] = useState(false);
  const fileRef = useRef(null);

  const onFiles = (files) => {
    if (!files) return;
    const arr = Array.from(files).filter(f => f.type.startsWith('image/'));
    arr.forEach(file => {
      const r = new FileReader();
      r.onloadend = () => { setAttached(p => [...p, { id: Math.random(), base64: r.result.split(',')[1], mimeType: file.type, preview: URL.createObjectURL(file) }]); setResult(''); };
      r.readAsDataURL(file);
    });
  };

  const analyze = async () => {
    if (attached.length === 0) return;
    setLoading(true); setResult('');
    try {
      const msg = [{ role: 'user', text: "你是一位专业视觉解析专家。请根据提供的图片，反推出精炼且细节丰富的 AI 绘画英文提示词 (Prompt)。直接输出结果，不要包含多余的解释文字。", images: attached }];
      const res = await callLLMAPI(msg, selectedModel, apiSettings);
      stream(res);
    } catch (e) { setResult(`请求错误: ${e.message}`); } finally { setLoading(false); }
  };

  const stream = (text) => {
    setIsStreaming(true); let idx = 0;
    const t = setInterval(() => {
      idx += 3; if (idx >= text.length) { clearInterval(t); setIsStreaming(false); setResult(text); return; }
      setResult(text.slice(0, idx));
    }, 20);
  };

  return (
    <div className="h-full flex flex-col items-center overflow-y-auto bg-[#F2F2F7] pb-24 pt-16 px-4">
      <div className="w-full max-w-2xl space-y-8 text-center mt-10">
        <div className="w-16 h-16 bg-white rounded-3xl flex items-center justify-center mx-auto border border-gray-100 shadow-sm text-[#007AFF]"><ImageIcon size={32} /></div>
        <div className="text-gray-800"><h1 className="text-2xl font-bold text-gray-900 tracking-tight">视觉特征反推</h1><p className="text-gray-400 text-sm mt-2">上传单张或多张参考图，AI 视觉模型将为您合成专业绘画提示词。</p></div>
        {attached.length > 0 ? (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 animate-in fade-in duration-500 text-gray-800">
            {attached.map(img => (
              <div key={img.id} className="relative aspect-square bg-white rounded-3xl border border-gray-200 overflow-hidden shadow-sm group">
                <img src={img.preview} className="w-full h-full object-cover" />
                <button onClick={() => setAttached(p => p.filter(i => i.id !== img.id))} className="absolute top-2 right-2 bg-black/50 hover:bg-red-500 text-white p-1 rounded-full opacity-0 group-hover:opacity-100 transition-all"><X size={14} /></button>
              </div>
            ))}
            <div onClick={() => fileRef.current.click()} className="aspect-square bg-white border-2 border-dashed border-gray-300 rounded-3xl flex items-center justify-center cursor-pointer hover:bg-white hover:border-[#007AFF] transition-all"><Plus size={24} className="text-gray-300" /></div>
          </div>
        ) : (
          <div onClick={() => fileRef.current.click()} className="w-full aspect-video bg-white border-2 border-dashed border-[#C6C6C8] rounded-[36px] flex flex-col items-center justify-center cursor-pointer hover:bg-gray-50 transition-all shadow-sm">
            <Upload size={48} className="opacity-30 text-[#007AFF] mb-4" /><p className="font-bold text-gray-600">点击或拖拽上传图片</p><p className="text-xs text-gray-400 mt-2">支持多图联合特征提取</p>
          </div>
        )}
        <input type="file" multiple ref={fileRef} onChange={(e) => onFiles(e.target.files)} className="hidden" accept="image/*" />
        {attached.length > 0 && <button onClick={analyze} disabled={loading || isStreaming} className="w-full py-4 bg-[#007AFF] text-white rounded-[20px] font-bold shadow-lg hover:bg-blue-600 transition-all active:scale-95">{loading ? <Loader2 size={20} className="animate-spin mx-auto"/> : `提取提示词 (${attached.length}图)`}</button>}
        {result && <div className="bg-white border border-[#E5E5EA] rounded-[30px] p-6 text-left relative shadow-sm animate-in fade-in slide-in-from-bottom-4 duration-500"><div className="flex items-center gap-2 mb-4 pb-3 border-b border-gray-50 font-bold text-sm text-gray-800">反推结果</div><div className="text-[15px] leading-relaxed whitespace-pre-wrap font-mono text-gray-800">{result}{isStreaming && <span className="inline-block w-2 h-4 ml-1 bg-[#007AFF] animate-pulse align-middle rounded-full text-gray-800"></span>}</div>{!isStreaming && <div className="mt-6 flex justify-end gap-3 pt-3 border-t border-gray-50 text-gray-800"><CopyButton text={result} /></div>}</div>}
      </div>
    </div>
  );
}

// ==========================================
// 模块 3: 提示词框架库管理
// ==========================================
function LibraryView({ structures, setStructures }) {
  const [modal, setModal] = useState(false);
  const [edit, setEdit] = useState(null);
  const save = (data) => { if (edit) setStructures(p => p.map(s => s.id === edit.id ? { ...data, id: edit.id } : s)); else setStructures(p => [{ ...data, id: Date.now().toString() }, ...p]); setModal(false); };
  return (
    <div className="h-full flex flex-col bg-[#F2F2F7] pb-24 pt-16 overflow-y-auto custom-scrollbar px-4">
      <div className="max-w-5xl mx-auto w-full py-8">
        <div className="flex justify-between items-end mb-10 px-2 text-gray-800">
          <div><h1 className="text-[28px] font-bold text-gray-900 tracking-tight">提示词框架库</h1><p className="text-gray-400 text-sm mt-1.5 font-medium">统一团队交付标准，管理常用的指令模板。</p></div>
          <button onClick={() => { setEdit(null); setModal(true); }} className="bg-[#007AFF] text-white px-5 py-2.5 rounded-full font-bold shadow-md hover:bg-blue-600 transition-all active:scale-95">+ 新增框架</button>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 text-gray-800">
          {structures.map(s => (
            <div key={s.id} className="bg-white border border-[#E5E5EA] rounded-[30px] p-6 shadow-sm group flex flex-col hover:shadow-md transition-all active:scale-[0.99]">
              <div className="flex justify-between items-start mb-4"><span className="text-[10px] px-2.5 py-1 bg-blue-50 text-blue-600 rounded-lg font-bold tracking-widest uppercase">{s.category}</span><div className="flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity"><button onClick={() => { setEdit(s); setModal(true); }} className="p-1.5 text-gray-400 hover:text-blue-500 hover:bg-blue-50 rounded-lg"><Edit2 size={16}/></button><button onClick={() => setStructures(p => p.filter(i => i.id !== s.id))} className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg"><Trash2 size={16}/></button></div></div>
              <h3 className="font-bold text-lg text-gray-900 mb-2">{s.name}</h3><p className="text-[13px] text-gray-400 mb-5 flex-1 leading-relaxed line-clamp-3 font-medium">{s.description}</p>
              <div className="bg-[#F8F8F9] rounded-2xl p-4 font-mono text-[11px] text-gray-500 leading-relaxed border border-gray-100 overflow-hidden shadow-inner"><div className="line-clamp-4">{s.template}</div></div>
            </div>
          ))}
        </div>
      </div>
      {modal && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white border border-white/20 w-full max-w-md rounded-[32px] shadow-2xl overflow-hidden p-8 animate-in zoom-in duration-300">
             <div className="flex justify-between items-center mb-8 text-gray-800"><h2 className="font-bold text-xl text-gray-900">{edit ? '编辑框架' : '新增框架'}</h2><button onClick={() => setModal(false)} className="p-1.5 bg-gray-100 hover:bg-gray-200 rounded-full text-gray-500 transition-colors"><X size={18}/></button></div>
             <form className="space-y-5 text-gray-800" onSubmit={(e) => { e.preventDefault(); const d = new FormData(e.target); save(Object.fromEntries(d)); }}>
                <div className="space-y-1.5"><label className="text-xs font-bold text-gray-400 uppercase ml-1">框架名称</label><input name="name" defaultValue={edit?.name} className="w-full border border-gray-200 bg-gray-50 rounded-xl p-3.5 text-sm focus:ring-2 focus:ring-blue-500/20 focus:bg-white outline-none" required /></div>
                <div className="space-y-1.5"><label className="text-xs font-bold text-gray-400 uppercase ml-1">所属分类</label><input name="category" defaultValue={edit?.category} className="w-full border border-gray-200 bg-gray-50 rounded-xl p-3.5 text-sm focus:ring-2 focus:ring-blue-500/20 focus:bg-white outline-none" /></div>
                <div className="space-y-1.5"><label className="text-xs font-bold text-gray-400 uppercase ml-1">指令模板内容</label><textarea name="template" defaultValue={edit?.template} className="w-full border border-gray-200 bg-[#F2F2F7] rounded-xl p-3.5 h-40 font-mono text-sm focus:ring-2 focus:ring-blue-500/20 focus:bg-white outline-none shadow-inner resize-none" required /></div>
                <button type="submit" className="w-full py-4 bg-[#007AFF] text-white font-bold rounded-2xl shadow-lg hover:bg-blue-600 transition-all active:scale-95">保存设置</button>
             </form>
          </div>
        </div>
      )}
    </div>
  );
}

// 辅助组件: 复制按钮
function CopyButton({ text }) {
  const [copied, setCopied] = useState(false);
  const handleCopy = () => { if (!text) return; navigator.clipboard.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 2000); };
  return (
    <button onClick={handleCopy} className="text-gray-400 hover:text-[#007AFF] text-[12px] font-bold flex items-center gap-1.5 py-1.5 px-3 hover:bg-blue-50 rounded-lg transition-all active:scale-95">
      {copied ? <><Check size={14} className="text-green-500" /> 已复制</> : <><Copy size={14} /> 复制提示词</>}
    </button>
  );
}