'use client';

import {
  Activity,
  BarChart3,
  Bell,
  BookOpen,
  CalendarDays,
  Check,
  ChevronLeft,
  ChevronRight,
  Clock3,
  ExternalLink,
  FileText,
  Flame,
  GitBranch,
  LayoutDashboard,
  LibraryBig,
  Link as LinkIcon,
  MessageCircle,
  MoreHorizontal,
  Pause,
  Pencil,
  Play,
  Plus,
  Search,
  Settings,
  Sparkles,
  Target,
  Trash2,
  Upload,
  Video,
  X,
} from 'lucide-react';
import {
  type CSSProperties,
  type FormEvent,
  type ReactNode,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';

type ResourceStatus = 'planned' | 'active' | 'completed';
type ResourceKind = 'book' | 'pdf' | 'video' | 'text';
type View = 'overview' | 'calendar' | 'resources' | 'progress';
type CalendarOverrideMode = 'rest' | 'practice' | 'discussion';

type Chapter = { start: number; end: number; title: string };
type Resource = {
  id: string;
  title: string;
  author: string;
  category: string;
  kind: ResourceKind;
  status: ResourceStatus;
  sourceUrl?: string;
  coverImage?: string;
  totalUnits: number;
  unitLabel: string;
  unitsPerSession: number;
  readingSessions: number;
  reviewSessions: number;
  sessionMinutes: number;
  estimatedHours: number;
  mediaDurationHours?: number;
  startDate?: string;
  accent: string;
  description: string;
  textContent?: string;
  fileName?: string;
  filePath?: string;
  chapters?: Chapter[];
};

type Session = {
  id: string;
  resourceId: string;
  date: string;
  index: number;
  kind: 'study' | 'review' | 'practice' | 'discussion';
  title: string;
  detail: string;
  startUnit?: number;
  endUnit?: number;
  minutes: number;
};

type CalendarOverride = {
  resourceId: string;
  date: string;
  mode: CalendarOverrideMode;
  title?: string;
  detail?: string;
  minutes?: number;
};
type CalendarOverrides = Record<string, CalendarOverride>;

type DailyActivity = Record<string, { minutes: number; sessions: number }>;
type AppState = {
  version: number;
  resources: Resource[];
  completedSessionIds: string[];
  activity: DailyActivity;
  calendarOverrides: CalendarOverrides;
};

const TODAY = '2026-08-27';
const GITHUB_REPOSITORY = 'amirmalek0/Career-path';
const GITHUB_BRANCH = 'master';
const REPOSITORY_STATE_PATH = 'public/data/resources.json';
const TOKEN_STORAGE_KEY = 'mastery.github-access-token';
const GITHUB_API_VERSION = '2022-11-28';
const RESOURCE_COVERS: Record<string, string> = {
  'postgresql-14-internals': 'covers/postgresql-14-internals.jpg',
  'postgresql-query-optimization': 'covers/postgresql-query-optimization.jpg',
  'database-internals': 'covers/database-internals.jpg',
  'ddia-second-edition': 'covers/ddia-second-edition.jpg',
  'distributed-systems-fourth-edition': 'covers/distributed-systems-fourth-edition.jpg',
  'fundamentals-software-architecture-2e': 'covers/fundamentals-software-architecture-2e.jpg',
  'software-architecture-hard-parts': 'covers/software-architecture-hard-parts.jpg',
  'learning-domain-driven-design': 'covers/learning-domain-driven-design.jpg',
  'learning-go-second-edition': 'covers/learning-go-second-edition.jpg',
  '100-go-mistakes': 'covers/100-go-mistakes.jpg',
  'docker-deep-dive-3e': 'covers/docker-deep-dive-third-edition.jpg',
  'continuous-delivery-book': 'covers/continuous-delivery.jpg',
  'accelerate-book': 'covers/accelerate.jpg',
  'google-sre-book': 'covers/site-reliability-engineering.jpg',
  'clrs-fourth-edition': 'covers/clrs-fourth-edition.jpg',
  'algorithms-fourth-edition': 'covers/algorithms-fourth-edition.jpg',
  ostep: 'covers/ostep.jpg',
};

const pad = (value: number) => String(value).padStart(2, '0');
const dateKey = (date: Date) => `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
const parseDate = (value: string) => new Date(`${value}T12:00:00`);
const addDays = (date: Date, amount: number) => {
  const next = new Date(date);
  next.setDate(next.getDate() + amount);
  return next;
};
const nextStudyDay = (date: Date) => {
  let next = new Date(date);
  while (next.getDay() === 0) next = addDays(next, 1);
  return next;
};
const formatDate = (value: string, options?: Intl.DateTimeFormatOptions) =>
  parseDate(value).toLocaleDateString('en-US', options ?? { month: 'short', day: 'numeric', year: 'numeric' });
const calendarOverrideKey = (resourceId: string, date: string) => `${resourceId}:${date}`;
const persistedGithubToken = () => typeof window === 'undefined' ? '' : window.localStorage.getItem(TOKEN_STORAGE_KEY)?.trim() ?? '';

function topicForPage(resource: Resource, page: number) {
  return resource.chapters?.find((chapter) => page >= chapter.start && page <= chapter.end)?.title ?? `Study block ${Math.ceil(page / resource.unitsPerSession)}`;
}

function buildSchedule(resource?: Resource, overrides: CalendarOverrides = {}): Session[] {
  if (!resource || resource.status === 'completed') return [];
  let cursor = nextStudyDay(parseDate(resource.startDate ?? TODAY));
  const sessions: Session[] = [];
  const handledOverrides = new Set<string>();
  const readingCount = Math.max(1, resource.readingSessions || Math.ceil(resource.totalUnits / resource.unitsPerSession));
  const reviewInterval = resource.reviewSessions ? Math.max(1, Math.floor(readingCount / resource.reviewSessions)) : Infinity;
  let reviewsAdded = 0;

  const movePastOverrides = () => {
    cursor = nextStudyDay(cursor);
    while (true) {
      const date = dateKey(cursor);
      const key = calendarOverrideKey(resource.id, date);
      const override = overrides[key];
      if (!override) return;
      handledOverrides.add(key);
      if (override.mode !== 'rest') {
        sessions.push({
          id: `${resource.id}-${override.mode}-${date}`,
          resourceId: resource.id,
          date,
          index: sessions.length + 1,
          kind: override.mode,
          title: override.title || (override.mode === 'discussion' ? 'Learning discussion' : 'Practical application'),
          detail: override.detail || (override.mode === 'discussion' ? 'Discuss key takeaways, questions, and different interpretations from recent study sessions.' : 'Apply the concepts from recent study sessions in a focused exercise.'),
          minutes: override.minutes || resource.sessionMinutes,
        });
      }
      cursor = addDays(cursor, 1);
      cursor = nextStudyDay(cursor);
    }
  };

  for (let index = 0; index < readingCount; index += 1) {
    movePastOverrides();
    const startUnit = Math.floor((index * resource.totalUnits) / readingCount) + 1;
    const endUnit = Math.floor(((index + 1) * resource.totalUnits) / readingCount);
    const isVideo = resource.kind === 'video';
    sessions.push({
      id: `${resource.id}-study-${index + 1}`,
      resourceId: resource.id,
      date: dateKey(cursor),
      index: sessions.length + 1,
      kind: 'study',
      title: isVideo ? `Lecture ${startUnit}${endUnit > startUnit ? `–${endUnit}` : ''}` : `${resource.unitLabel === 'pages' ? 'Pages' : resource.unitLabel} ${startUnit}–${endUnit}`,
      detail: isVideo ? 'Watch, annotate, and write the key takeaway' : topicForPage(resource, startUnit),
      startUnit,
      endUnit,
      minutes: resource.sessionMinutes,
    });
    cursor = addDays(cursor, 1);

    const shouldReview = resource.reviewSessions > 0 && reviewsAdded < resource.reviewSessions && ((index + 1) % reviewInterval === 0 || index === readingCount - 1);
    if (shouldReview) {
      movePastOverrides();
      reviewsAdded += 1;
      sessions.push({
        id: `${resource.id}-review-${reviewsAdded}`,
        resourceId: resource.id,
        date: dateKey(cursor),
        index: sessions.length + 1,
        kind: 'review',
        title: `Review & lab ${reviewsAdded}`,
        detail: 'Consolidate notes, recall concepts, and run a practical experiment',
        minutes: resource.sessionMinutes,
      });
      cursor = addDays(cursor, 1);
    }
  }

  Object.entries(overrides).forEach(([key, override]) => {
    if (override.resourceId !== resource.id || override.mode === 'rest' || handledOverrides.has(key)) return;
    sessions.push({
      id: `${resource.id}-${override.mode}-${override.date}`,
      resourceId: resource.id,
      date: override.date,
      index: 0,
      kind: override.mode,
      title: override.title || (override.mode === 'discussion' ? 'Learning discussion' : 'Practical application'),
      detail: override.detail || (override.mode === 'discussion' ? 'Discuss key takeaways, questions, and different interpretations from recent study sessions.' : 'Apply the concepts from recent study sessions in a focused exercise.'),
      minutes: override.minutes || resource.sessionMinutes,
    });
  });

  return sessions.sort((left, right) => left.date.localeCompare(right.date)).map((session, index) => ({ ...session, index: index + 1 }));
}

function normalizeState(repositoryState: Partial<AppState> & { resources: Resource[] }): AppState {
  return {
    version: repositoryState.version ?? 3,
    resources: repositoryState.resources,
    completedSessionIds: repositoryState.completedSessionIds ?? [],
    activity: repositoryState.activity ?? {},
    calendarOverrides: repositoryState.calendarOverrides ?? {},
  };
}

function base64ToUtf8(value: string) {
  const binary = atob(value.replace(/\s/g, ''));
  const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

async function readState(token = ''): Promise<AppState> {
  const response = await fetch(
    `https://api.github.com/repos/${GITHUB_REPOSITORY}/contents/${encodeRepositoryPath(REPOSITORY_STATE_PATH)}?ref=${GITHUB_BRANCH}&t=${Date.now()}`,
    {
      cache: 'no-store',
      headers: {
        Accept: 'application/vnd.github+json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        'X-GitHub-Api-Version': GITHUB_API_VERSION,
      },
    },
  );
  if (!response.ok) {
    const detail = (await response.json().catch(() => null) as { message?: string } | null)?.message;
    throw new Error(detail || 'Could not load the live project data.');
  }
  const file = await response.json() as { content?: string; encoding?: string };
  if (!file.content || file.encoding !== 'base64') throw new Error('The project database response was invalid.');
  return normalizeState(JSON.parse(base64ToUtf8(file.content)) as Partial<AppState> & { resources: Resource[] });
}

async function readBundledState(): Promise<AppState> {
  const response = await fetch('data/resources.json', { cache: 'no-store' });
  if (!response.ok) throw new Error('Could not load the bundled project data.');
  return normalizeState(await response.json() as Partial<AppState> & { resources: Resource[] });
}

const encodeRepositoryPath = (path: string) => path.split('/').map(encodeURIComponent).join('/');

function bytesToBase64(bytes: Uint8Array) {
  let binary = '';
  const chunkSize = 0x8000;
  for (let index = 0; index < bytes.length; index += chunkSize) binary += String.fromCharCode(...bytes.subarray(index, index + chunkSize));
  return btoa(binary);
}

async function repositoryFileSha(path: string, token: string) {
  const response = await fetch(`https://api.github.com/repos/${GITHUB_REPOSITORY}/contents/${encodeRepositoryPath(path)}?ref=${GITHUB_BRANCH}`, {
    cache: 'no-store',
    headers: { Accept: 'application/vnd.github+json', Authorization: `Bearer ${token}`, 'X-GitHub-Api-Version': GITHUB_API_VERSION },
  });
  if (response.status === 404) return undefined;
  if (!response.ok) throw new Error('Repository access was rejected. Check the token and Contents permission.');
  return (await response.json() as { sha: string }).sha;
}

async function putRepositoryFile(path: string, content: string, message: string, token: string) {
  const sha = await repositoryFileSha(path, token);
  const response = await fetch(`https://api.github.com/repos/${GITHUB_REPOSITORY}/contents/${encodeRepositoryPath(path)}`, {
    method: 'PUT',
    headers: { Accept: 'application/vnd.github+json', Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', 'X-GitHub-Api-Version': GITHUB_API_VERSION },
    body: JSON.stringify({ message, content, branch: GITHUB_BRANCH, ...(sha ? { sha } : {}) }),
  });
  if (!response.ok) throw new Error((await response.json().catch(() => null) as { message?: string } | null)?.message || 'GitHub could not save the change.');
}

async function deleteRepositoryFile(path: string, token: string) {
  const sha = await repositoryFileSha(path, token);
  if (!sha) return;
  const response = await fetch(`https://api.github.com/repos/${GITHUB_REPOSITORY}/contents/${encodeRepositoryPath(path)}`, {
    method: 'DELETE',
    headers: { Accept: 'application/vnd.github+json', Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', 'X-GitHub-Api-Version': GITHUB_API_VERSION },
    body: JSON.stringify({ message: `Remove ${path.split('/').at(-1)}`, sha, branch: GITHUB_BRANCH }),
  });
  if (!response.ok) throw new Error('GitHub could not remove the file.');
}

async function saveRepositoryState(state: AppState, token: string) {
  const content = bytesToBase64(new TextEncoder().encode(`${JSON.stringify(state, null, 2)}\n`));
  await putRepositoryFile(REPOSITORY_STATE_PATH, content, 'Update learning dashboard data', token);
}

function NavButton({ active, icon, label, onClick }: { active: boolean; icon: ReactNode; label: string; onClick: () => void }) {
  return <button className={`nav-item ${active ? 'active' : ''}`} onClick={onClick}>{icon}<span>{label}</span></button>;
}

const coverFor = (resource: Resource) => resource.coverImage || RESOURCE_COVERS[resource.id];

function ResourceGlyph({ resource }: { resource: Resource }) {
  const [coverFailed, setCoverFailed] = useState(false);
  const cover = coverFor(resource);
  if (cover && !coverFailed) return <span className="resource-code cover-thumb"><img src={cover} alt="" onError={() => setCoverFailed(true)} /></span>;
  const label = resource.title.split(' ').filter(Boolean).slice(0, resource.kind === 'video' ? 3 : 2).map((word) => word[0]).join('').toUpperCase();
  return <span className={`resource-code ${resource.accent}`}>{resource.kind === 'pdf' ? <FileText size={19} /> : resource.kind === 'text' ? <BookOpen size={19} /> : label}</span>;
}

function ResourceCover({ resource }: { resource: Resource }) {
  const [coverFailed, setCoverFailed] = useState(false);
  const cover = coverFor(resource);
  if (cover && !coverFailed) return <div className={`resource-cover ${resource.accent}`}><img src={cover} alt={`${resource.title} cover`} loading="lazy" onError={() => setCoverFailed(true)} /></div>;
  return <div className={`resource-cover cover-fallback ${resource.accent}`}><ResourceGlyph resource={resource} /><span>{resource.category}</span><strong>{resource.title}</strong></div>;
}

export default function Home() {
  const [state, setState] = useState<AppState | null>(null);
  const [view, setView] = useState<View>('overview');
  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | ResourceStatus>('all');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [showAddResource, setShowAddResource] = useState(false);
  const [editingResource, setEditingResource] = useState<Resource | null>(null);
  const [editingCalendarDate, setEditingCalendarDate] = useState<string | null>(null);
  const [calendarEditorMode, setCalendarEditorMode] = useState<'practice' | 'discussion'>('practice');
  const [previewText, setPreviewText] = useState<Resource | null>(null);
  const [calendarCursor, setCalendarCursor] = useState(() => new Date(2026, 7, 1, 12));
  const [selectedDate, setSelectedDate] = useState(TODAY);
  const [toast, setToast] = useState('');
  const [showRepositoryAccess, setShowRepositoryAccess] = useState(false);
  const [githubToken, setGithubToken] = useState(persistedGithubToken);
  const [syncStatus, setSyncStatus] = useState<'auth' | 'saving' | 'saved' | 'error'>(() => persistedGithubToken() ? 'saving' : 'auth');
  const searchRef = useRef<HTMLInputElement>(null);
  const saveQueueRef = useRef<Promise<void>>(Promise.resolve());
  const stateRef = useRef<AppState | null>(null);
  const githubTokenRef = useRef(githubToken);

  useEffect(() => {
    let cancelled = false;
    const storedToken = githubTokenRef.current;

    const load = async () => {
      try {
        const loaded = await readState(storedToken);
        if (cancelled) return;
        stateRef.current = loaded;
        setState(loaded);
        if (storedToken) setSyncStatus('saved');
      } catch (error) {
        try {
          const loaded = storedToken ? await readState() : await readBundledState();
          if (cancelled) return;
          stateRef.current = loaded;
          setState(loaded);
          if (storedToken) {
            setSyncStatus('error');
            setToast('The saved token was rejected. Open GitHub connection to replace it.');
          }
        } catch {
          try {
            const loaded = await readBundledState();
            if (cancelled) return;
            stateRef.current = loaded;
            setState(loaded);
            setSyncStatus(storedToken ? 'error' : 'auth');
            setToast(error instanceof Error ? error.message : 'Could not load the live project data.');
          } catch {
            if (!cancelled) setToast('Could not load the project data. Refresh to retry.');
          }
        }
      }
    };
    void load();
    return () => { cancelled = true; };
  }, []); // The stored credential is intentionally read only once on startup.

  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        searchRef.current?.focus();
      }
      if (event.key === 'Escape') {
        setShowAddResource(false);
        setEditingResource(null);
        setEditingCalendarDate(null);
        setShowRepositoryAccess(false);
        setPreviewText(null);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  useEffect(() => {
    if (!toast) return;
    const timeout = window.setTimeout(() => setToast(''), 2800);
    return () => window.clearTimeout(timeout);
  }, [toast]);

  const resources = state?.resources ?? [];
  const activeResource = resources.find((resource) => resource.status === 'active');
  const schedule = useMemo(() => buildSchedule(activeResource, state?.calendarOverrides ?? {}), [activeResource, state?.calendarOverrides]);
  const completedIds = useMemo(() => new Set(state?.completedSessionIds ?? []), [state?.completedSessionIds]);
  const completedSessions = schedule.filter((session) => completedIds.has(session.id));
  const completedUnits = completedSessions.filter((session) => session.kind === 'study').reduce((sum, session) => sum + ((session.endUnit ?? 0) - (session.startUnit ?? 1) + 1), 0);
  const activeProgress = activeResource ? Math.min(100, Math.round((completedUnits / activeResource.totalUnits) * 100)) : 0;
  const todaySession = schedule.find((session) => session.date === TODAY) ?? schedule.find((session) => !completedIds.has(session.id));
  const dueDate = schedule.at(-1)?.date;
  const totalMinutes = Object.values(state?.activity ?? {}).reduce((sum, day) => sum + day.minutes, 0);
  const completedCount = state?.completedSessionIds.length ?? 0;

  const filteredResources = resources.filter((resource) => {
    const matchesQuery = `${resource.title} ${resource.author} ${resource.category}`.toLowerCase().includes(query.toLowerCase());
    const matchesCategory = categoryFilter === 'all' || resource.category === categoryFilter;
    return matchesQuery && matchesCategory && (statusFilter === 'all' || resource.status === statusFilter);
  });
  const categories = useMemo(() => ['all', ...Array.from(new Set(resources.map((resource) => resource.category))).sort()], [resources]);

  const calendarDays = useMemo(() => {
    const year = calendarCursor.getFullYear();
    const month = calendarCursor.getMonth();
    const firstWeekday = new Date(year, month, 1).getDay();
    const days = new Date(year, month + 1, 0).getDate();
    return [...Array.from({ length: firstWeekday }, () => null), ...Array.from({ length: days }, (_, index) => index + 1)];
  }, [calendarCursor]);

  const selectedSessions = schedule.filter((session) => session.date === selectedDate);
  const selectedOverride = activeResource ? state?.calendarOverrides[calendarOverrideKey(activeResource.id, selectedDate)] : undefined;
  const selectedEditorOverride = selectedOverride?.mode === calendarEditorMode ? selectedOverride : undefined;
  const canEditSelectedDay = Boolean(activeResource && selectedDate >= TODAY && !selectedSessions.some((session) => completedIds.has(session.id)));
  const daysWithSessions = useMemo(() => new Map(schedule.map((session) => [session.date, session])), [schedule]);
  const last14Days = useMemo(() => Array.from({ length: 14 }, (_, index) => dateKey(addDays(parseDate(TODAY), index - 13))), []);
  const maxDailyMinutes = Math.max(90, ...last14Days.map((date) => state?.activity[date]?.minutes ?? 0));

  function updateState(mutator: (current: AppState) => AppState) {
    const current = stateRef.current;
    if (!current) return;
    const next = mutator(current);
    stateRef.current = next;
    setState(next);

    const token = githubTokenRef.current;
    if (!token) {
      setSyncStatus('auth');
      setShowRepositoryAccess(true);
      return;
    }

    setSyncStatus('saving');
    saveQueueRef.current = saveQueueRef.current
      .then(() => saveRepositoryState(next, token))
      .then(() => setSyncStatus('saved'))
      .catch((error: Error) => {
        setSyncStatus('error');
        setToast(error.message || 'The project data could not be saved.');
      });
  }

  function activateResource(id: string) {
    updateState((current) => ({
      ...current,
      resources: current.resources.map((resource) => resource.id === id
        ? { ...resource, status: 'active', startDate: TODAY }
        : resource.status === 'active' ? { ...resource, status: 'planned' } : resource),
    }));
    setCalendarCursor(new Date(2026, 7, 1, 12));
    setSelectedDate(TODAY);
    setToast('Active resource updated and calendar rebuilt.');
  }

  function completeResource(id: string) {
    updateState((current) => ({ ...current, resources: current.resources.map((resource) => resource.id === id ? { ...resource, status: 'completed' } : resource) }));
    setToast('Resource marked as completed.');
  }

  async function deleteResource(id: string) {
    const resource = resources.find((item) => item.id === id);
    if (!resource || !window.confirm(`Delete “${resource.title}”?`)) return;
    if (resource.filePath && !githubToken) {
      setShowRepositoryAccess(true);
      setToast('Connect GitHub before deleting a resource with an attached PDF.');
      return;
    }
    if (resource.filePath) {
      try {
        await deleteRepositoryFile(`public/${resource.filePath}`, githubToken);
      } catch (error) {
        setToast(error instanceof Error ? error.message : 'The attached PDF could not be removed.');
        return;
      }
    }
    updateState((current) => ({ ...current, resources: current.resources.filter((item) => item.id !== id) }));
    setToast('Resource deleted.');
  }

  function toggleSession(session: Session) {
    updateState((current) => {
      const isCompleted = current.completedSessionIds.includes(session.id);
      const ids = isCompleted ? current.completedSessionIds.filter((id) => id !== session.id) : [...current.completedSessionIds, session.id];
      const currentDay = current.activity[session.date] ?? { minutes: 0, sessions: 0 };
      const updatedDay = {
        minutes: Math.max(0, currentDay.minutes + (isCompleted ? -session.minutes : session.minutes)),
        sessions: Math.max(0, currentDay.sessions + (isCompleted ? -1 : 1)),
      };
      return { ...current, completedSessionIds: ids, activity: { ...current.activity, [session.date]: updatedDay } };
    });
    setToast(completedIds.has(session.id) ? 'Session reopened.' : 'Session completed — progress saved.');
  }

  async function connectRepository(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!state) return;
    const form = new FormData(event.currentTarget);
    const token = String(form.get('token') ?? '').trim();
    if (!token) return;
    setSyncStatus('saving');
    try {
      await saveRepositoryState(state, token);
      window.localStorage.setItem(TOKEN_STORAGE_KEY, token);
      githubTokenRef.current = token;
      setGithubToken(token);
      setSyncStatus('saved');
      setShowRepositoryAccess(false);
      setToast('Connected. Dashboard changes now save to the GitHub project.');
      event.currentTarget.reset();
    } catch (error) {
      setSyncStatus('error');
      setToast(error instanceof Error ? error.message : 'Could not connect to the repository.');
    }
  }

  async function uploadPdfToRepository(file: File, resourceId: string) {
    const token = githubTokenRef.current;
    if (!token) {
      setShowRepositoryAccess(true);
      throw new Error('Connect GitHub before uploading a PDF.');
    }
    const safeName = file.name.replace(/[^a-zA-Z0-9._-]+/g, '-');
    const repositoryPath = `public/uploads/${resourceId}/${safeName}`;
    const content = bytesToBase64(new Uint8Array(await file.arrayBuffer()));
    await putRepositoryFile(repositoryPath, content, `Upload PDF for ${resourceId}`, token);
    return `uploads/${resourceId}/${safeName}`;
  }

  function openResource(resource: Resource) {
    if (resource.filePath) {
      window.open(`https://raw.githubusercontent.com/${GITHUB_REPOSITORY}/${GITHUB_BRANCH}/public/${encodeRepositoryPath(resource.filePath)}`, '_blank', 'noopener,noreferrer');
    } else if (resource.textContent) {
      setPreviewText(resource);
    } else if (resource.sourceUrl) {
      window.open(resource.sourceUrl, '_blank', 'noopener,noreferrer');
    }
  }

  function makeRestDay() {
    if (!activeResource || !canEditSelectedDay) return;
    const key = calendarOverrideKey(activeResource.id, selectedDate);
    updateState((current) => ({
      ...current,
      calendarOverrides: {
        ...current.calendarOverrides,
        [key]: { resourceId: activeResource.id, date: selectedDate, mode: 'rest' },
      },
    }));
    setEditingCalendarDate(null);
    setToast('Rest day saved. The remaining reading plan moved forward.');
  }

  function resetCalendarDay() {
    if (!activeResource || !canEditSelectedDay) return;
    const key = calendarOverrideKey(activeResource.id, selectedDate);
    updateState((current) => {
      const calendarOverrides = { ...current.calendarOverrides };
      delete calendarOverrides[key];
      return { ...current, calendarOverrides };
    });
    setEditingCalendarDate(null);
    setToast('Day restored to the automatic learning plan.');
  }

  function saveCalendarFocusDay(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!activeResource || !editingCalendarDate) return;
    const form = new FormData(event.currentTarget);
    const key = calendarOverrideKey(activeResource.id, editingCalendarDate);
    const practiceDay: CalendarOverride = {
      resourceId: activeResource.id,
      date: editingCalendarDate,
      mode: calendarEditorMode,
      title: String(form.get('title') ?? '').trim() || (calendarEditorMode === 'discussion' ? 'Learning discussion' : 'Practical application'),
      detail: String(form.get('detail') ?? '').trim() || (calendarEditorMode === 'discussion' ? 'Discuss key takeaways, questions, and different interpretations from recent study sessions.' : 'Apply the concepts from recent study sessions in a focused exercise.'),
      minutes: Math.max(10, Number(form.get('minutes')) || activeResource.sessionMinutes),
    };
    updateState((current) => ({ ...current, calendarOverrides: { ...current.calendarOverrides, [key]: practiceDay } }));
    setEditingCalendarDate(null);
    setToast(`${calendarEditorMode === 'discussion' ? 'Discussion' : 'Practice'} day saved. Reading sessions were rescheduled automatically.`);
  }

  async function addResource(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const title = String(form.get('title') ?? '').trim();
    const kind = String(form.get('kind') ?? 'book') as ResourceKind;
    const totalUnits = Number(form.get('totalUnits')) || 1;
    const unitsPerSession = Number(form.get('unitsPerSession')) || 1;
    const sessionMinutes = Number(form.get('sessionMinutes')) || 60;
    const readingSessions = Number(form.get('readingSessions')) || Math.ceil(totalUnits / unitsPerSession);
    const reviewSessions = Number(form.get('reviewSessions')) || 0;
    const estimatedHours = Number(form.get('estimatedHours')) || Math.round(((readingSessions + reviewSessions) * sessionMinutes / 60) * 10) / 10;
    const status = String(form.get('status') ?? 'planned') as ResourceStatus;
    const file = form.get('file');
    const resourceId = `${title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')}-${Date.now()}`;
    let filePath: string | undefined;
    if (file instanceof File && file.size) {
      try {
        filePath = await uploadPdfToRepository(file, resourceId);
      } catch (error) {
        setToast(error instanceof Error ? error.message : 'The PDF could not be uploaded.');
        return;
      }
    }
    const resource: Resource = {
      id: resourceId,
      title,
      author: String(form.get('author') ?? '').trim() || 'Unknown author',
      category: String(form.get('category') ?? '').trim() || 'General',
      kind,
      status,
      sourceUrl: String(form.get('sourceUrl') ?? '').trim() || undefined,
      coverImage: String(form.get('coverImage') ?? '').trim() || undefined,
      totalUnits,
      unitLabel: String(form.get('unitLabel') ?? '').trim() || (kind === 'video' ? 'lessons' : 'pages'),
      unitsPerSession,
      readingSessions,
      reviewSessions,
      sessionMinutes,
      estimatedHours,
      startDate: String(form.get('startDate') ?? '').trim() || (status === 'active' ? TODAY : undefined),
      accent: ['green', 'lavender', 'sand', 'blue'][resources.length % 4],
      description: String(form.get('description') ?? '').trim() || 'Custom learning resource.',
      textContent: String(form.get('textContent') ?? '').trim() || undefined,
      fileName: file instanceof File && file.size ? file.name : undefined,
      filePath,
    };
    updateState((current) => ({
      ...current,
      resources: [...current.resources.map((item) => resource.status === 'active' && item.status === 'active' ? { ...item, status: 'planned' as const } : item), resource],
    }));
    setShowAddResource(false);
    setToast('Resource added to your local library.');
    event.currentTarget.reset();
  }

  async function editResource(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editingResource) return;
    const form = new FormData(event.currentTarget);
    const file = form.get('file');
    const hasNewFile = file instanceof File && file.size > 0;
    const removeFile = form.get('removeFile') === 'on';
    const status = String(form.get('status') ?? editingResource.status) as ResourceStatus;
    const totalUnits = Math.max(1, Number(form.get('totalUnits')) || editingResource.totalUnits);
    const unitsPerSession = Math.max(1, Number(form.get('unitsPerSession')) || editingResource.unitsPerSession);
    const readingSessions = Math.max(1, Number(form.get('readingSessions')) || Math.ceil(totalUnits / unitsPerSession));
    const reviewSessions = Math.max(0, Number(form.get('reviewSessions')) || 0);
    const sessionMinutes = Math.max(10, Number(form.get('sessionMinutes')) || editingResource.sessionMinutes);
    const estimatedHours = Math.max(0.1, Number(form.get('estimatedHours')) || Math.round(((readingSessions + reviewSessions) * sessionMinutes / 60) * 10) / 10);
    let filePath = editingResource.filePath;
    if ((hasNewFile || removeFile) && !githubToken) {
      setShowRepositoryAccess(true);
      setToast('Connect GitHub before changing an attached PDF.');
      return;
    }
    try {
      if (hasNewFile && file instanceof File) filePath = await uploadPdfToRepository(file, editingResource.id);
      if ((removeFile || (hasNewFile && editingResource.filePath && editingResource.filePath !== filePath)) && editingResource.filePath) {
        await deleteRepositoryFile(`public/${editingResource.filePath}`, githubToken);
      }
      if (removeFile) filePath = undefined;
    } catch (error) {
      setToast(error instanceof Error ? error.message : 'The PDF change could not be saved.');
      return;
    }
    const updated: Resource = {
      ...editingResource,
      title: String(form.get('title') ?? '').trim() || editingResource.title,
      author: String(form.get('author') ?? '').trim() || 'Unknown author',
      category: String(form.get('category') ?? '').trim() || 'General',
      kind: String(form.get('kind') ?? editingResource.kind) as ResourceKind,
      status,
      sourceUrl: String(form.get('sourceUrl') ?? '').trim() || undefined,
      coverImage: String(form.get('coverImage') ?? '').trim() || undefined,
      totalUnits,
      unitLabel: String(form.get('unitLabel') ?? '').trim() || editingResource.unitLabel,
      unitsPerSession,
      readingSessions,
      reviewSessions,
      sessionMinutes,
      estimatedHours,
      startDate: String(form.get('startDate') ?? '').trim() || (status === 'active' ? editingResource.startDate ?? TODAY : undefined),
      description: String(form.get('description') ?? '').trim() || 'Custom learning resource.',
      textContent: String(form.get('textContent') ?? '').trim() || undefined,
      fileName: removeFile ? undefined : hasNewFile ? file.name : editingResource.fileName,
      filePath,
    };
    updateState((current) => ({
      ...current,
      resources: current.resources.map((resource) => {
        if (resource.id === updated.id) return updated;
        if (status === 'active' && resource.status === 'active') return { ...resource, status: 'planned' };
        return resource;
      }),
    }));
    setEditingResource(null);
    setToast('Resource and schedule estimate updated.');
  }

  if (!state) {
    return <main className="loading-screen"><span className="brand-mark"><BookOpen size={20} /></span><p>Opening your learning space…</p></main>;
  }

  return (
    <main className="app-shell">
      <aside className="sidebar">
        <button className="brand" onClick={() => setView('overview')}>
          <span className="brand-mark"><BookOpen size={19} /></span><span>Mastery</span>
        </button>
        <nav className="primary-nav" aria-label="Primary navigation">
          <p className="nav-label">Workspace</p>
          <NavButton active={view === 'overview'} icon={<LayoutDashboard size={18} />} label="Overview" onClick={() => setView('overview')} />
          <NavButton active={view === 'calendar'} icon={<CalendarDays size={18} />} label="Learning plan" onClick={() => setView('calendar')} />
          <NavButton active={view === 'resources'} icon={<LibraryBig size={18} />} label="Resources" onClick={() => setView('resources')} />
          <NavButton active={view === 'progress'} icon={<BarChart3 size={18} />} label="Progress" onClick={() => setView('progress')} />
          <p className="nav-label nav-label-secondary">Manage</p>
          <button className="nav-item" onClick={() => setToast('Preferences are coming after dashboard approval.')}><Settings size={18} /><span>Preferences</span></button>
        </nav>
        <div className="sidebar-card">
          <span className="sidebar-card-icon"><Sparkles size={16} /></span>
          <p>Shared learning space</p><span>Amirs &amp; Amir Khan</span>
        </div>
      </aside>

      <section className="workspace">
        <header className="topbar">
          <div>
            <p className="eyebrow">Thursday, August 27</p>
            <h1>{view === 'overview' ? 'Good morning, learners.' : view === 'calendar' ? 'Your learning plan.' : view === 'resources' ? 'Resource library.' : 'Learning progress.'}</h1>
          </div>
          <div className="topbar-actions">
            <label className="search-box">
              <Search size={17} /><input ref={searchRef} aria-label="Search resources" placeholder="Search anything" value={query} onChange={(event) => setQuery(event.target.value)} /><kbd>⌘ K</kbd>
            </label>
            <button className={`repository-sync ${syncStatus}`} onClick={() => setShowRepositoryAccess(true)}><GitBranch size={16} /><span>{syncStatus === 'saving' ? 'Saving…' : syncStatus === 'saved' ? 'Project synced' : syncStatus === 'error' ? 'Sync failed' : 'Connect GitHub'}</span></button>
            <button className="icon-button" aria-label="Notifications" onClick={() => setToast('You are all caught up.')}><Bell size={18} /></button>
            <div className="avatar-stack" aria-label="Amirs and Amir Khan"><span>A</span><span>AK</span></div>
          </div>
        </header>

        <div className="content">
          {view === 'overview' && (
            <>
              <section className="stats-grid" aria-label="Learning summary">
                <article className="stat-card"><span className="stat-icon mint"><Target size={19} /></span><div><strong>{activeProgress}%</strong><p>Active progress</p></div><span className="trend">{completedCount} sessions</span></article>
                <article className="stat-card"><span className="stat-icon peach"><Clock3 size={19} /></span><div><strong>{todaySession?.minutes ?? 0}m</strong><p>Today&apos;s focus</p></div><span className="trend">{todaySession?.title ?? 'No session'}</span></article>
                <article className="stat-card"><span className="stat-icon violet"><Flame size={19} /></span><div><strong>{Object.values(state.activity).filter((day) => day.sessions > 0).length} days</strong><p>Study consistency</p></div><span className="trend">{Math.round(totalMinutes / 60)}h logged</span></article>
              </section>

              <section className="dashboard-grid">
                {activeResource ? (
                  <article className="focus-card">
                    <div className="focus-copy">
                      <div className="section-kicker"><span className="live-dot" /> Active resource</div>
                      <h2>{activeResource.title}</h2><p className="author">{activeResource.author} · {activeResource.kind === 'video' ? 'Video course' : 'Technical book'}</p>
                      <div className="focus-meta">
                        <span><BookOpen size={16} /> {activeResource.totalUnits} {activeResource.unitLabel}</span>
                        <span><CalendarDays size={16} /> {schedule.length} sessions</span>
                        <span><Clock3 size={16} /> ~{activeResource.estimatedHours} hours</span>
                        {dueDate && <span><Target size={16} /> Finish {formatDate(dueDate, { month: 'short', day: 'numeric' })}</span>}
                      </div>
                      {todaySession ? <button className="primary-button" onClick={() => toggleSession(todaySession)}>{completedIds.has(todaySession.id) ? <><Check size={16} />Completed today</> : <><Play size={16} fill="currentColor" />Complete today&apos;s session</>}</button> : <button className="primary-button"><Pause size={16} />No session today</button>}
                    </div>
                    <div className="today-plan">
                      <div className="ring" style={{ '--progress': `${Math.max(1, activeProgress)}%` } as CSSProperties}><div><strong>{activeProgress}%</strong><span>complete</span></div></div>
                      <div className="today-plan-copy"><span>Session {pad(todaySession?.index ?? 0)}</span><strong>{todaySession?.title ?? 'Rest day'}</strong><p>{todaySession?.detail ?? 'Recover and consolidate what you learned.'}</p></div>
                    </div>
                  </article>
                ) : (
                  <article className="focus-card empty-focus"><div><div className="section-kicker">No active resource</div><h2>Choose what to master next.</h2><button className="primary-button" onClick={() => setView('resources')}>Open resources</button></div></article>
                )}

                <article className="weekly-card">
                  <div className="card-heading"><div><p className="section-kicker">Learning calendar</p><h3>This week</h3></div><button className="text-button" onClick={() => setView('calendar')}>Full calendar <ChevronRight size={15} /></button></div>
                  <div className="week-row">
                    {Array.from({ length: 7 }, (_, index) => addDays(parseDate('2026-08-24'), index)).map((date) => {
                      const key = dateKey(date); const item = daysWithSessions.get(key); const completed = item ? completedIds.has(item.id) : false;
                      return <button className={`day-cell ${key === TODAY ? 'today' : key < TODAY ? 'past' : item ? 'planned' : 'rest'} ${completed ? 'complete' : ''}`} key={key} onClick={() => { setSelectedDate(key); setView('calendar'); }}><span>{date.toLocaleDateString('en-US', { weekday: 'short' })}</span><strong>{date.getDate()}</strong><i /></button>;
                    })}
                  </div>
                  <div className="calendar-agenda"><span className="agenda-time">TODAY</span><span className="agenda-line" /><div><strong>{todaySession ? `${todaySession.title} · ${activeResource?.title}` : 'Recovery day'}</strong><p>{todaySession ? `${todaySession.minutes} min · ${todaySession.detail}` : 'No learning block scheduled'}</p></div><button aria-label="Open session" onClick={() => setView('calendar')}><ChevronRight size={17} /></button></div>
                </article>
              </section>

              <section className="resource-preview">
                <div className="card-heading"><div><p className="section-kicker">Your library</p><h3>Up next</h3></div><button className="text-button" onClick={() => setView('resources')}>View all resources <ChevronRight size={15} /></button></div>
                <div className="resource-row">
                  {resources.filter((resource) => resource.status === 'planned').slice(0, 3).map((resource) => <article key={resource.id}><ResourceGlyph resource={resource} /><div><strong>{resource.title}</strong><p>{resource.totalUnits} {resource.unitLabel} · {resource.readingSessions + resource.reviewSessions} sessions</p></div><span className="status-pill">Planned</span></article>)}
                </div>
              </section>
            </>
          )}

          {view === 'calendar' && (
            <section className="calendar-layout">
              <article className="month-card">
                <div className="calendar-toolbar">
                  <div><p className="section-kicker">Active roadmap</p><h2>{calendarCursor.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}</h2></div>
                  <div><button className="icon-button" aria-label="Previous month" onClick={() => setCalendarCursor(new Date(calendarCursor.getFullYear(), calendarCursor.getMonth() - 1, 1, 12))}><ChevronLeft size={18} /></button><button className="today-button" onClick={() => setCalendarCursor(new Date(2026, 7, 1, 12))}>Today</button><button className="icon-button" aria-label="Next month" onClick={() => setCalendarCursor(new Date(calendarCursor.getFullYear(), calendarCursor.getMonth() + 1, 1, 12))}><ChevronRight size={18} /></button></div>
                </div>
                <div className="month-weekdays">{['Sun','Mon','Tue','Wed','Thu','Fri','Sat'].map((day) => <span key={day}>{day}</span>)}</div>
                <div className="month-grid">
                  {calendarDays.map((day, index) => {
                    if (!day) return <span className="month-day blank" key={`blank-${index}`} />;
                    const key = `${calendarCursor.getFullYear()}-${pad(calendarCursor.getMonth() + 1)}-${pad(day)}`;
                    const session = daysWithSessions.get(key); const complete = session ? completedIds.has(session.id) : false;
                    const override = activeResource ? state.calendarOverrides[calendarOverrideKey(activeResource.id, key)] : undefined;
                    return <button key={key} className={`month-day ${key === TODAY ? 'today' : ''} ${session ? 'scheduled' : ''} ${session?.kind === 'practice' ? 'practice' : ''} ${session?.kind === 'discussion' ? 'discussion' : ''} ${override?.mode === 'rest' ? 'rest-override' : ''} ${complete ? 'complete' : ''} ${selectedDate === key ? 'selected' : ''}`} onClick={() => setSelectedDate(key)}><span>{day}</span>{session && <div><i>{session.kind === 'review' ? 'Review' : session.title}</i><small>{session.minutes}m</small></div>}{!session && override?.mode === 'rest' && <div><i>Rest day</i><small>Plan paused</small></div>}{complete && <Check size={14} />}</button>;
                  })}
                </div>
              </article>
              <aside className="day-panel">
                <p className="section-kicker">Selected day</p><h3>{formatDate(selectedDate, { weekday: 'long', month: 'long', day: 'numeric' })}</h3>
                {selectedSessions.length ? selectedSessions.map((session) => <div className="session-detail" key={session.id}><span className={`session-kind ${session.kind}`}>{session.kind}</span><h4>{session.title}</h4><p>{session.detail}</p><dl><div><dt>Duration</dt><dd>{session.minutes} min</dd></div><div><dt>Session</dt><dd>{session.index} / {schedule.length}</dd></div></dl><button className={completedIds.has(session.id) ? 'secondary-button completed' : 'primary-button'} onClick={() => toggleSession(session)}>{completedIds.has(session.id) ? <><Check size={16} />Completed</> : <><Play size={16} />Mark complete</>}</button></div>) : <div className="rest-message"><Sparkles size={20} /><strong>Recovery day</strong><p>No task is scheduled. Use the space to rest or review your notes.</p></div>}
                {activeResource && <div className="calendar-editor"><div><span>Adjust this day</span><p>Replace reading with practice or a group discussion, or leave the day empty. Later reading sessions move forward automatically.</p></div><div className="calendar-editor-actions"><button className="practice-button" disabled={!canEditSelectedDay} onClick={() => { setCalendarEditorMode('practice'); setEditingCalendarDate(selectedDate); }}><Activity size={15} />{selectedOverride?.mode === 'practice' ? 'Edit practice' : 'Practice day'}</button><button className="discussion-button" disabled={!canEditSelectedDay} onClick={() => { setCalendarEditorMode('discussion'); setEditingCalendarDate(selectedDate); }}><MessageCircle size={15} />{selectedOverride?.mode === 'discussion' ? 'Edit discussion' : 'Discussion day'}</button><button className="rest-button" disabled={!canEditSelectedDay} onClick={makeRestDay}><Pause size={15} />Rest day</button>{selectedOverride && <button className="reset-day-button" disabled={!canEditSelectedDay} onClick={resetCalendarDay}><X size={15} />Reset</button>}</div>{!canEditSelectedDay && <small>Past or completed days cannot be rescheduled.</small>}</div>}
                {activeResource && <div className="plan-summary"><span>Plan estimate</span><strong>{schedule.length} sessions · {activeResource.estimatedHours}h</strong><p>{activeResource.totalUnits} {activeResource.unitLabel} at {activeResource.unitsPerSession} per study session, with {activeResource.reviewSessions} review/lab sessions.</p></div>}
              </aside>
            </section>
          )}

          {view === 'resources' && (
            <section>
              <div className="page-actions">
                <div className="resource-filters">
                  <div className="filter-pills">{(['all','active','planned','completed'] as const).map((status) => <button className={statusFilter === status ? 'active' : ''} onClick={() => setStatusFilter(status)} key={status}>{status}</button>)}</div>
                  <select className="category-filter" aria-label="Filter resources by category" value={categoryFilter} onChange={(event) => setCategoryFilter(event.target.value)}>{categories.map((category) => <option value={category} key={category}>{category === 'all' ? 'All topics' : category}</option>)}</select>
                </div>
                <button className="add-button" onClick={() => setShowAddResource(true)}><Plus size={16} />Add resource</button>
              </div>
              <div className="resource-grid">
                {filteredResources.map((resource) => {
                  const resourceSchedule = buildSchedule(resource, state.calendarOverrides); const resourceCompleted = resource.status === 'completed' ? 100 : resource.status === 'active' ? activeProgress : 0;
                  return <article className={`library-card ${resource.status}`} key={resource.id}>
                    <ResourceCover resource={resource} />
                    <div className="library-card-top"><ResourceGlyph resource={resource} /><span className={`library-status ${resource.status}`}>{resource.status}</span><button className="more-button" aria-label={`More actions for ${resource.title}`}><MoreHorizontal size={18} /></button></div>
                    <p className="resource-category">{resource.category} · {resource.kind}</p><h3>{resource.title}</h3><p className="resource-author">{resource.author}</p><p className="resource-description">{resource.description}</p>
                    <div className="estimate-grid"><div><span>Material</span><strong>{resource.totalUnits} {resource.unitLabel}</strong></div><div><span>Daily pace</span><strong>{resource.unitsPerSession} {resource.unitLabel}</strong></div><div><span>Plan</span><strong>{resource.readingSessions + resource.reviewSessions} sessions</strong></div><div><span>Estimate</span><strong>{resource.estimatedHours} hours</strong></div></div>
                    <div className="mini-progress"><span style={{ width: `${resourceCompleted}%` }} /></div>
                    <div className="library-actions"><button className="secondary-button" onClick={() => setEditingResource(resource)}><Pencil size={15} />Edit</button>{(resource.sourceUrl || resource.filePath || resource.textContent) && <button className="secondary-button" onClick={() => openResource(resource)}>{resource.filePath ? <FileText size={15} /> : <ExternalLink size={15} />}Open</button>}{resource.status === 'planned' && <button className="primary-button" onClick={() => activateResource(resource.id)}><Play size={15} />Make active</button>}{resource.status === 'active' && <button className="secondary-button" onClick={() => completeResource(resource.id)}><Check size={15} />Complete</button>}{resource.status === 'completed' && <button className="secondary-button" onClick={() => activateResource(resource.id)}><Play size={15} />Study again</button>}<button className="danger-button" aria-label={`Delete ${resource.title}`} onClick={() => deleteResource(resource.id)}><Trash2 size={15} /></button></div>
                    {resource.status === 'active' && resourceSchedule.at(-1) && <p className="finish-note">Estimated finish: {formatDate(resourceSchedule.at(-1)!.date)}</p>}
                  </article>;
                })}
              </div>
            </section>
          )}

          {view === 'progress' && (
            <section className="progress-layout">
              <div className="progress-hero"><div><p className="section-kicker">Your momentum</p><h2>{Math.round(totalMinutes / 60)} focused hours</h2><p>Every completed calendar session is saved automatically to your daily record.</p></div><div className="progress-hero-number"><strong>{completedCount}</strong><span>sessions done</span></div></div>
              <article className="activity-card"><div className="card-heading"><div><p className="section-kicker">Daily progress</p><h3>Last 14 days</h3></div><span className="legend-dot">Minutes studied</span></div><div className="bar-chart">{last14Days.map((date) => { const minutes = state.activity[date]?.minutes ?? 0; return <div className="bar-column" key={date}><span className="bar-value">{minutes || ''}</span><i style={{ height: `${Math.max(4, (minutes / maxDailyMinutes) * 100)}%` }} className={minutes ? 'filled' : ''} /><small>{parseDate(date).toLocaleDateString('en-US', { weekday: 'narrow' })}</small></div>; })}</div></article>
              <article className="resource-progress-card"><div className="card-heading"><div><p className="section-kicker">Resource progress</p><h3>Library overview</h3></div></div><div className="progress-list">{resources.map((resource) => { const progress = resource.status === 'completed' ? 100 : resource.status === 'active' ? activeProgress : 0; return <div key={resource.id}><ResourceGlyph resource={resource} /><span><strong>{resource.title}</strong><small>{resource.status} · {resource.estimatedHours}h estimated</small></span><div className="progress-track"><i style={{ width: `${progress}%` }} /></div><b>{progress}%</b></div>; })}</div></article>
            </section>
          )}
        </div>
      </section>

      {showAddResource && (
        <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setShowAddResource(false); }}>
          <section className="modal" role="dialog" aria-modal="true" aria-labelledby="add-resource-title">
            <button className="modal-close" onClick={() => setShowAddResource(false)} aria-label="Close"><X size={18} /></button>
            <p className="section-kicker">Resource library</p><h2 id="add-resource-title">Add a learning resource</h2>
            <p className="modal-intro">Add a link, text note, book, or PDF, then set its exact study estimate. Files and progress are committed to the GitHub project.</p>
            <form onSubmit={addResource}>
              <div className="form-grid">
                <label><span>Title</span><input name="title" required placeholder="e.g. PostgreSQL Performance" /></label>
                <label><span>Author / source</span><input name="author" placeholder="Author or publisher" /></label>
                <label><span>Category</span><input name="category" defaultValue="Database" /></label>
                <label><span>Resource type</span><select name="kind" defaultValue="book"><option value="book">Book</option><option value="pdf">PDF</option><option value="video">Video course</option><option value="text">Text / notes</option></select></label>
                <label><span>Total amount</span><input name="totalUnits" type="number" min="1" defaultValue="100" /></label>
                <label><span>Unit</span><input name="unitLabel" defaultValue="pages" /></label>
                <label><span>Amount per session</span><input name="unitsPerSession" type="number" min="1" defaultValue="10" /></label>
                <label><span>Study sessions</span><input name="readingSessions" type="number" min="1" defaultValue="10" /></label>
                <label><span>Review / lab sessions</span><input name="reviewSessions" type="number" min="0" defaultValue="2" /></label>
                <label><span>Minutes per session</span><input name="sessionMinutes" type="number" min="10" defaultValue="60" /></label>
                <label><span>Estimated hours</span><input name="estimatedHours" type="number" min="0.1" step="0.1" defaultValue="12" /></label>
                <label><span>Start date</span><input name="startDate" type="date" defaultValue={TODAY} /></label>
                <label><span>Status</span><select name="status" defaultValue="planned"><option value="planned">Planned</option><option value="active">Active</option><option value="completed">Completed</option></select></label>
                <label><span>Source URL</span><div className="input-with-icon"><LinkIcon size={15} /><input name="sourceUrl" type="url" placeholder="https://…" /></div></label>
                <label><span>Custom cover URL</span><div className="input-with-icon"><LinkIcon size={15} /><input name="coverImage" type="url" placeholder="https://…/cover.jpg" /></div></label>
              </div>
              <label><span>Description</span><textarea name="description" rows={2} placeholder="What will you learn?" /></label>
              <label><span>Text content (optional)</span><textarea name="textContent" rows={4} placeholder="Paste notes or learning material here…" /></label>
              <label className="file-drop"><Upload size={20} /><strong>Add a PDF file</strong><span>The file is committed under public/uploads in the project</span><input name="file" type="file" accept="application/pdf,.pdf" /></label>
              <div className="modal-actions"><button type="button" className="secondary-button" onClick={() => setShowAddResource(false)}>Cancel</button><button type="submit" className="primary-button"><Plus size={16} />Add resource</button></div>
            </form>
          </section>
        </div>
      )}

      {editingResource && (
        <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setEditingResource(null); }}>
          <section className="modal" role="dialog" aria-modal="true" aria-labelledby="edit-resource-title">
            <button className="modal-close" onClick={() => setEditingResource(null)} aria-label="Close"><X size={18} /></button>
            <p className="section-kicker">Resource library</p><h2 id="edit-resource-title">Edit resource &amp; estimate</h2>
            <p className="modal-intro">Change its metadata, schedule assumptions, status, or attach a PDF. Saving an active resource rebuilds its calendar.</p>
            <form key={editingResource.id} onSubmit={editResource}>
              <div className="form-grid">
                <label><span>Title</span><input name="title" required defaultValue={editingResource.title} /></label>
                <label><span>Author / source</span><input name="author" defaultValue={editingResource.author} /></label>
                <label><span>Category</span><input name="category" defaultValue={editingResource.category} /></label>
                <label><span>Resource type</span><select name="kind" defaultValue={editingResource.kind}><option value="book">Book</option><option value="pdf">PDF</option><option value="video">Video course</option><option value="text">Text / notes</option></select></label>
                <label><span>Total amount</span><input name="totalUnits" type="number" min="1" defaultValue={editingResource.totalUnits} /></label>
                <label><span>Unit</span><input name="unitLabel" defaultValue={editingResource.unitLabel} /></label>
                <label><span>Amount per session</span><input name="unitsPerSession" type="number" min="1" defaultValue={editingResource.unitsPerSession} /></label>
                <label><span>Study sessions</span><input name="readingSessions" type="number" min="1" defaultValue={editingResource.readingSessions} /></label>
                <label><span>Review / lab sessions</span><input name="reviewSessions" type="number" min="0" defaultValue={editingResource.reviewSessions} /></label>
                <label><span>Minutes per session</span><input name="sessionMinutes" type="number" min="10" defaultValue={editingResource.sessionMinutes} /></label>
                <label><span>Estimated hours</span><input name="estimatedHours" type="number" min="0.1" step="0.1" defaultValue={editingResource.estimatedHours} /></label>
                <label><span>Start date</span><input name="startDate" type="date" defaultValue={editingResource.startDate ?? TODAY} /></label>
                <label><span>Status</span><select name="status" defaultValue={editingResource.status}><option value="planned">Planned</option><option value="active">Active</option><option value="completed">Completed</option></select></label>
                <label><span>Source URL</span><div className="input-with-icon"><LinkIcon size={15} /><input name="sourceUrl" type="url" defaultValue={editingResource.sourceUrl ?? ''} placeholder="https://…" /></div></label>
                <label><span>Custom cover URL</span><div className="input-with-icon"><LinkIcon size={15} /><input name="coverImage" type="url" defaultValue={editingResource.coverImage ?? ''} placeholder="https://…/cover.jpg" /></div></label>
              </div>
              <label><span>Description</span><textarea name="description" rows={2} defaultValue={editingResource.description} /></label>
              <label><span>Text content (optional)</span><textarea name="textContent" rows={4} defaultValue={editingResource.textContent ?? ''} /></label>
              {editingResource.fileName && <div className="existing-file"><FileText size={17} /><span><strong>Attached PDF</strong><small>{editingResource.fileName}</small></span><label className="remove-file"><input name="removeFile" type="checkbox" /> Remove</label></div>}
              <label className="file-drop"><Upload size={20} /><strong>{editingResource.fileName ? 'Replace the attached PDF' : 'Attach a PDF file'}</strong><span>The file is committed under public/uploads in the project</span><input name="file" type="file" accept="application/pdf,.pdf" /></label>
              <div className="modal-actions"><button type="button" className="secondary-button" onClick={() => setEditingResource(null)}>Cancel</button><button type="submit" className="primary-button"><Check size={16} />Save changes</button></div>
            </form>
          </section>
        </div>
      )}

      {editingCalendarDate && activeResource && (
        <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setEditingCalendarDate(null); }}>
          <section className="modal calendar-event-modal" role="dialog" aria-modal="true" aria-labelledby="calendar-focus-day-title">
            <button className="modal-close" onClick={() => setEditingCalendarDate(null)} aria-label="Close"><X size={18} /></button>
            <p className="section-kicker">{calendarEditorMode === 'discussion' ? 'Shared learning' : 'Practical work'}</p><h2 id="calendar-focus-day-title">Plan a {calendarEditorMode} day</h2>
            <p className="modal-intro">{formatDate(editingCalendarDate, { weekday: 'long', month: 'long', day: 'numeric' })} will become {calendarEditorMode === 'discussion' ? 'a conversation about recent lessons' : 'a hands-on learning day'}. The displaced reading session moves to the next available day.</p>
            <form key={`${activeResource.id}-${editingCalendarDate}-${calendarEditorMode}`} onSubmit={saveCalendarFocusDay}>
              <label><span>{calendarEditorMode === 'discussion' ? 'Discussion topic' : 'Practice title'}</span><input name="title" required defaultValue={selectedEditorOverride?.title ?? (calendarEditorMode === 'discussion' ? `Discuss ${activeResource.title}` : `Practice ${activeResource.title} concepts`)} /></label>
              <label><span>{calendarEditorMode === 'discussion' ? 'Questions and talking points' : 'What will you build or test?'}</span><textarea name="detail" rows={4} defaultValue={selectedEditorOverride?.detail ?? (calendarEditorMode === 'discussion' ? 'Share the most important takeaways, compare interpretations, discuss unanswered questions, and agree on concepts to review.' : 'Apply the concepts from the latest reading sessions, document findings, and note questions to revisit.')} /></label>
              <label><span>Duration in minutes</span><input name="minutes" type="number" min="10" defaultValue={selectedEditorOverride?.minutes ?? activeResource.sessionMinutes} /></label>
              <div className="modal-actions"><button type="button" className="secondary-button" onClick={() => setEditingCalendarDate(null)}>Cancel</button><button type="submit" className="primary-button">{calendarEditorMode === 'discussion' ? <MessageCircle size={16} /> : <Activity size={16} />}Save {calendarEditorMode} day</button></div>
            </form>
          </section>
        </div>
      )}

      {showRepositoryAccess && (
        <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setShowRepositoryAccess(false); }}>
          <section className="modal repository-modal" role="dialog" aria-modal="true" aria-labelledby="repository-access-title">
            <button className="modal-close" onClick={() => setShowRepositoryAccess(false)} aria-label="Close"><X size={18} /></button>
            <p className="section-kicker">Project persistence</p><h2 id="repository-access-title">Connect the GitHub project</h2>
            {githubToken ? <><div className="repository-connected"><Check size={18} /><div><strong>Connected on this device</strong><p>Every data change is written to {GITHUB_REPOSITORY}. The token stays in this browser until you disconnect or clear browser data.</p></div></div><div className="modal-actions"><button type="button" className="secondary-button" onClick={() => { window.localStorage.removeItem(TOKEN_STORAGE_KEY); githubTokenRef.current = ''; setGithubToken(''); setSyncStatus('auth'); }}>Disconnect &amp; forget token</button><button type="button" className="primary-button" onClick={() => setShowRepositoryAccess(false)}>Done</button></div></> : <form onSubmit={connectRepository}><p className="modal-intro">Use a fine-grained GitHub token with Contents: Read and write access to {GITHUB_REPOSITORY}. It will be saved in this browser so future visits reconnect automatically.</p><label><span>Fine-grained access token</span><input name="token" type="password" required autoComplete="off" placeholder="github_pat_…" /></label><a className="token-help" href="https://github.com/settings/personal-access-tokens/new" target="_blank" rel="noreferrer">Create a fine-grained token <ExternalLink size={13} /></a><div className="repository-note"><GitBranch size={17} /><p>Progress, resource edits, calendar changes, and uploaded PDFs update the project database immediately. Only code changes trigger a site deployment.</p></div><div className="modal-actions"><button type="button" className="secondary-button" onClick={() => setShowRepositoryAccess(false)}>Cancel</button><button type="submit" className="primary-button"><GitBranch size={16} />Connect &amp; save</button></div></form>}
          </section>
        </div>
      )}

      {previewText && <div className="modal-backdrop"><section className="modal text-preview" role="dialog" aria-modal="true"><button className="modal-close" onClick={() => setPreviewText(null)} aria-label="Close"><X size={18} /></button><p className="section-kicker">{previewText.category} · text</p><h2>{previewText.title}</h2><p className="resource-author">{previewText.author}</p><article>{previewText.textContent}</article></section></div>}
      {toast && <div className="toast" role="status"><Check size={16} />{toast}</div>}
    </main>
  );
}
