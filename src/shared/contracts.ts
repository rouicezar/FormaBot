export type ProviderId = 'deepseek' | 'openai' | 'anthropic' | 'openrouter';
export interface ModelInput { provider: ProviderId; model: string; apiKey: string }
export interface ModelView { provider: ProviderId; model: string; hasKey: boolean }
export interface WorkspaceView { path: string; authorized: boolean; outputDir?: string }
export interface TaskView {memberId?:string;roleVersion?:number;jobId?:string;instruction?:string;stream?:string;id:string;status:string;output:string;events:string[];conversationId?:string;artifacts?:string[];model?:string;modelConnected?:boolean}
export interface ArtifactEntry {taskId:string;path:string;conversationId:string;conversationName:string;createdAt?:string;messageId:number}
export interface AppState {locale?:'en'|'zh-CN';conversationWorkspaces?:Record<string,{path:string;inherited:boolean;authorized:boolean}>;effectiveWorkspace?:{path:string;inherited:boolean;authorized:boolean};artifactHistory?:ArtifactEntry[];attachments:WebAttachment[];memberModels?:Record<string,{provider:string;model:string}>;roleHistory?:RoleVersion[]; model?: ModelView; workspace?: WorkspaceView; runtime: string; ready:boolean; task?:TaskView; conversations:Conversation[]; selected?:string; messages:ChatMessage[]; layout:Layout; browserVersion:number; jobs:GroupJob[]; browser:BrowserState; roleRequests:RoleRequestView[]; busyBots:string[] }
export type Reply<T> = { ok: true; value: T } | { ok: false; error: string };
export interface TaskProgress {conversationId:string;jobId:string;event:string;kind?:'narration'}
export interface FormaApi {
  mcpStatus():Promise<Reply<import('../capabilities/mcp').McpView>>;
  mcpConnect():Promise<Reply<import('../capabilities/mcp').McpView>>;
  mcpCancel():Promise<Reply<import('../capabilities/mcp').McpView>>;
  mcpDisconnect():Promise<Reply<import('../capabilities/mcp').McpView>>;
  setSkillEnabled(input:{id:string;enabled:boolean}):Promise<Reply<void>>;
  discoverTools():Promise<Reply<import('../capabilities/discovery').ToolInventory>>;
  setLocale(locale:'en'|'zh-CN'):Promise<Reply<AppState>>;
  pickConversationWorkspace():Promise<Reply<{token:string;path:string}|null>>;
  openSettings():Promise<Reply<null>>;
  onTaskProgress(listener:(progress:TaskProgress)=>void):()=>void;
  createConversation(input:Omit<Conversation,'id'>&{workspaceToken?:string|null;sourceBotId?:string}):Promise<Reply<AppState>>;
  sidebarAction(input:{id:string;action:'pin'|'unread'|'hide'|'section'|'duplicate'|'copy-id';value?:boolean|string}):Promise<Reply<AppState>>;
  deleteConversation(id:string):Promise<Reply<AppState>>;
  selectConversation(id:string):Promise<Reply<AppState>>;
  updateConversation(input:{id:string;name:string;role:string;members?:string[];expectedRoleVersion?:number;workspaceToken?:string|null}):Promise<Reply<AppState>>;
  saveLayout(layout:Layout):Promise<Reply<null>>;
  browserBounds(bounds:{x:number;y:number;width:number;height:number;visible:boolean}):Promise<Reply<null>>;
  browserControl(input:{action:'navigate'|'back'|'forward'|'reload'|'stop';url?:string}):Promise<Reply<null>>;
  copySource(input:{taskId:string;path:string}):Promise<Reply<null>>;
  previewRelated(input:{taskId:string;path:string;relative:string}):Promise<Reply<Preview>>;
  preview(input:{taskId:string;path:string}):Promise<Reply<Preview>>;
  state(): Promise<Reply<AppState>>;
  saveModel(input: ModelInput): Promise<Reply<AppState>>;
  deleteModel(): Promise<Reply<AppState>>;
  chooseWorkspace(): Promise<Reply<AppState>>;
  runTask(prompt:string, member?:string):Promise<Reply<AppState>>;
  stopTask():Promise<Reply<AppState>>;
  forgetWorkspace():Promise<Reply<AppState>>;
  roleRequests():Promise<Reply<RoleRequestView[]>>;
  resolveRoleRequest(input:{id:string;approve:boolean}):Promise<Reply<AppState>>;
  handoffRules():Promise<Reply<HandoffRuleView[]>>;
  deleteHandoffRule(rule:HandoffRuleView):Promise<Reply<HandoffRuleView[]>>;
  approvalRules():Promise<Reply<ApprovalRuleView[]>>;
  deleteApprovalRule(rule:ApprovalRuleView):Promise<Reply<ApprovalRuleView[]>>;
  setMemberModel(input:{botId:string;provider:string;model:string|null}):Promise<Reply<AppState>>;
  setOutputDir(dir:string):Promise<Reply<AppState>>;
  createTeamFromDocument():Promise<Reply<AppState>>;
  browserPick():Promise<Reply<AppState>>;
  browserCapture():Promise<Reply<AppState>>;
  pasteImage(input:{conversationId:string;data:string}):Promise<Reply<AppState>>;
  attachmentImage(input:{id:string}):Promise<Reply<string>>;
  removeAttachment(input:{id:string}):Promise<Reply<AppState>>;
  memories():Promise<Reply<MemoryView[]>>;
  deleteMemory(input:{id:number}):Promise<Reply<MemoryView[]>>;
}

export interface Conversation {id:string;name:string;role:string;roleVersion?:number;kind:'bot'|'group';members:string[];managerId?:string;sidebar?:{pinned?:boolean;unread?:boolean;hidden?:boolean;section?:string}}
export interface ChatMessage extends Partial<MessageAuthor> {id:number;speaker:string;content:string;taskId?:string;artifacts:string[]}
export interface Layout {left:number;right:number;leftOpen:boolean;rightOpen:boolean}
export interface Preview {kind:'text'|'image';content:string;path:string}
export interface ApprovalRuleView {workspace?:string;host:string;action:string;decision:'always_allow'|'require'}
export interface HandoffRuleView {requesterId:string;target:string;member:string}
export interface MemoryView {id:number;botName:string;conversationName:string;content:string;createdAt:string}

export interface GroupJob {roleVersion?:number;id:string;member:string;memberName:string;instruction:string;status:string;error:string}
export interface BrowserState {url:string;loading:boolean;canGoBack:boolean;canGoForward:boolean;error:string;manual:boolean;picking:boolean}
export interface WebAttachment {id:string;url:string;title:string;text:string;hash:string;createdAt:string;kind?:'text'|'image';imagePath?:string}

export interface MessageAuthor {authorKind:'human'|'system'|'bot'|'unknown';authorId?:string;roleVersion?:number}
export interface RoleVersion {version:number;role:string;source:'migration'|'user_create'|'user_edit'|'user_approved'|'team_create'|'duplicate';actorId?:string;createdAt:string}
export interface RoleRequestView {id:string;requesterName:string;requesterId:string;targetId:string;targetName:string;role:string;reason:string}
