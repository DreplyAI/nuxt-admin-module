// $apiFetch is auto-imported from the base layer's
// composables/useApiFetch.ts (see the assistant overlay's note on
// why a `~/composables/useApiFetch` import would fail here).
import type {
  CoachListFilters,
  CoachRecommendation,
  CoachRecommendationDetail,
  CoachReviewPatch,
  CoachStats,
  CursorPage,
} from '../types'

/**
 * Typed wrapper over a go-assistant-core coach `adminkit` surface
 * (gymtracer/fitniac `backend/modules/coach/admin`):
 *
 *   GET    /admin/coach/recommendations[?kind=&status=&source=&userId=&limit=&cursor=]
 *   GET    /admin/coach/recommendations/stats
 *   GET    /admin/coach/recommendations/kinds
 *   GET    /admin/coach/recommendations/{id}
 *   PATCH  /admin/coach/recommendations/{id}     body: {status?, notes?, quality?}
 *
 * Pages own their own loading/error state.
 */
export function useCoachAdmin() {
  function qs(params: Record<string, string | number | undefined>): string {
    const p = new URLSearchParams()
    for (const [k, v] of Object.entries(params)) {
      if (v !== undefined && v !== '') p.set(k, String(v))
    }
    const s = p.toString()
    return s ? `?${s}` : ''
  }

  async function listRecommendations(
    filters: CoachListFilters = {},
  ): Promise<CursorPage<CoachRecommendation>> {
    return $apiFetch<CursorPage<CoachRecommendation>>(
      `/api/v1/admin/coach/recommendations${qs(filters as Record<string, any>)}`,
    )
  }

  async function getRecommendation(id: string): Promise<CoachRecommendationDetail> {
    return $apiFetch<CoachRecommendationDetail>(
      `/api/v1/admin/coach/recommendations/${encodeURIComponent(id)}`,
    )
  }

  async function reviewRecommendation(
    id: string,
    patch: CoachReviewPatch,
  ): Promise<CoachRecommendationDetail> {
    return $apiFetch<CoachRecommendationDetail>(
      `/api/v1/admin/coach/recommendations/${encodeURIComponent(id)}`,
      { method: 'PATCH', body: patch },
    )
  }

  async function statsByStatus(): Promise<CoachStats> {
    return $apiFetch<CoachStats>('/api/v1/admin/coach/recommendations/stats')
  }

  async function statsByKind(): Promise<CoachStats> {
    return $apiFetch<CoachStats>('/api/v1/admin/coach/recommendations/kinds')
  }

  return {
    listRecommendations,
    getRecommendation,
    reviewRecommendation,
    statsByStatus,
    statsByKind,
  }
}
