import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowRight, Clock, Dumbbell, Filter, Play, Search, Video } from 'lucide-react'
import { Badge, PageTitle } from '../components/ui'
import {
  CATEGORY_LABEL,
  EXERCISES,
  STATUS_LABEL,
  VIEW_LABEL,
  type Category,
  type ExerciseDef,
  type Status,
  type View,
} from '../lib/exercises'

const STATUS_TONES: Record<Status, 'teal' | 'amber' | 'neutral'> = {
  prototype: 'teal',
  experimental: 'amber',
  unsupported: 'neutral',
}

export default function ExerciseLibrary() {
  const [query, setQuery] = useState('')
  const [category, setCategory] = useState<Category | 'all'>('all')
  const [view, setView] = useState<View | 'all'>('all')
  const [status, setStatus] = useState<Status | 'all'>('all')

  const filtered = useMemo(() => {
    return EXERCISES.filter((ex) => {
      if (category !== 'all' && ex.category !== category) return false
      if (view !== 'all' && ex.view !== view && ex.view !== 'either') return false
      if (status !== 'all' && ex.status !== status) return false
      if (query.trim()) {
        const q = query.toLowerCase()
        const matchesName = ex.name.toLowerCase().includes(q)
        const matchesRegion = ex.region.toLowerCase().includes(q)
        const matchesSummary = ex.summary.toLowerCase().includes(q)
        const matchesEquipment = ex.equipment.toLowerCase().includes(q)
        if (!matchesName && !matchesRegion && !matchesSummary && !matchesEquipment) return false
      }
      return true
    })
  }, [query, category, view, status])

  const categories: Array<{ id: Category | 'all'; label: string }> = [
    { id: 'all', label: 'All exercises' },
    { id: 'upper', label: CATEGORY_LABEL.upper },
    { id: 'lower', label: CATEGORY_LABEL.lower },
    { id: 'mobility', label: CATEGORY_LABEL.mobility },
  ]

  return (
    <div className="mx-auto max-w-6xl px-4 py-12">
      <PageTitle
        eyebrow="Exercise Catalog"
        title="Full-Body Rehabilitation Library"
      >
        Explore 18 guided exercises across upper body, lower body, and mobility.
        Computer vision tracking runs directly in your browser.
      </PageTitle>

      {/* Search and Filters Bar */}
      <div className="mb-8 space-y-4 rounded-xl border border-rule bg-white p-5 shadow-sm">
        <div className="relative">
          <Search className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" aria-hidden />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search by exercise name, body region, or equipment..."
            className="w-full rounded-lg border border-rule bg-paper py-2.5 pl-10 pr-4 text-sm outline-none transition focus:border-teal focus:bg-white focus:ring-1 focus:ring-teal"
          />
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
          {/* Category Tabs */}
          <div className="flex flex-wrap gap-1.5" role="tablist" aria-label="Exercise category">
            {categories.map((c) => (
              <button
                key={c.id}
                role="tab"
                aria-selected={category === c.id}
                onClick={() => setCategory(c.id)}
                className={`rounded-md px-3 py-1.5 text-xs font-semibold transition ${
                  category === c.id
                    ? 'bg-ink text-white'
                    : 'bg-paper text-muted hover:bg-rule/60 hover:text-ink'
                }`}
              >
                {c.label}
              </button>
            ))}
          </div>

          {/* Secondary Filters */}
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <span className="flex items-center gap-1 text-muted">
              <Filter className="h-3.5 w-3.5" aria-hidden /> Orientation:
            </span>
            <select
              value={view}
              onChange={(e) => setView(e.target.value as View | 'all')}
              className="rounded border border-rule bg-paper px-2 py-1 text-xs outline-none focus:border-teal"
            >
              <option value="all">Any view</option>
              <option value="front">Facing camera</option>
              <option value="side">Side to camera</option>
              <option value="either">Front or side</option>
            </select>

            <span className="ml-2 text-muted">Status:</span>
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value as Status | 'all')}
              className="rounded border border-rule bg-paper px-2 py-1 text-xs outline-none focus:border-teal"
            >
              <option value="all">All statuses</option>
              <option value="prototype">Prototype</option>
              <option value="experimental">Experimental</option>
              <option value="unsupported">Not single-camera</option>
            </select>
          </div>
        </div>
      </div>

      {/* Count summary */}
      <div className="mb-4 flex items-center justify-between text-xs text-muted">
        <span>Showing {filtered.length} of {EXERCISES.length} exercises</span>
        {(query || category !== 'all' || view !== 'all' || status !== 'all') && (
          <button
            onClick={() => { setQuery(''); setCategory('all'); setView('all'); setStatus('all') }}
            className="text-teal underline hover:text-ink"
          >
            Reset all filters
          </button>
        )}
      </div>

      {/* Exercise Grid */}
      {filtered.length === 0 ? (
        <div className="rounded-xl border border-dashed border-rule bg-white py-16 text-center">
          <p className="font-display text-lg font-bold">No exercises match your filter</p>
          <p className="mt-1 text-sm text-muted">Try clearing your search term or adjusting filters.</p>
        </div>
      ) : (
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((ex) => (
            <ExerciseCard key={ex.id} exercise={ex} />
          ))}
        </div>
      )}
    </div>
  )
}

function ExerciseCard({ exercise: ex }: { exercise: ExerciseDef }) {
  const isTrackable = !!ex.track

  return (
    <div className="group flex flex-col justify-between rounded-xl border border-rule bg-white p-5 transition hover:border-teal hover:shadow-md">
      <div>
        <div className="mb-3 flex items-start justify-between gap-2">
          <span className="font-mono text-xs uppercase tracking-wider text-muted">
            {ex.region}
          </span>
          <Badge tone={STATUS_TONES[ex.status]}>
            {STATUS_LABEL[ex.status]}
          </Badge>
        </div>

        <h3 className="font-display text-lg font-bold text-ink group-hover:text-teal transition-colors">
          <Link to={`/exercises/${ex.id}`}>{ex.name}</Link>
        </h3>
        <p className="mt-2 text-sm text-muted line-clamp-2">{ex.summary}</p>

        <div className="mt-4 flex flex-wrap gap-x-4 gap-y-2 border-t border-rule pt-3 text-xs text-muted">
          <span className="inline-flex items-center gap-1">
            <Video className="h-3.5 w-3.5 text-teal" aria-hidden />
            {VIEW_LABEL[ex.view]}
          </span>
          <span className="inline-flex items-center gap-1">
            <Dumbbell className="h-3.5 w-3.5 text-muted" aria-hidden />
            {ex.equipment}
          </span>
          <span className="inline-flex items-center gap-1">
            <Clock className="h-3.5 w-3.5 text-muted" aria-hidden />
            ~{ex.minutes} min
          </span>
        </div>
      </div>

      <div className="mt-6 flex items-center justify-between border-t border-rule/60 pt-4">
        <Link
          to={`/exercises/${ex.id}`}
          className="inline-flex items-center gap-1 text-xs font-semibold text-muted hover:text-ink"
        >
          Details & Safety <ArrowRight className="h-3.5 w-3.5" aria-hidden />
        </Link>

        {isTrackable ? (
          <Link
            to={`/exercise?id=${ex.id}`}
            className="inline-flex items-center gap-1.5 rounded-md bg-teal px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-[#127a6b]"
          >
            <Play className="h-3 w-3 fill-white" aria-hidden /> Start
          </Link>
        ) : (
          <span className="text-xs italic text-muted">Not trackable</span>
        )}
      </div>
    </div>
  )
}
