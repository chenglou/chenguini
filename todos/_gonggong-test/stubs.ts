export type EventType = 'diffusion' | 'diffusion_upsample_v5_2x' | null

type Image = { rating: null; filtered: boolean; selected: boolean }

export type ImagineJobData = {
  progressStatus: 'completed'
  id: string
  event_type: EventType
  enqueue_time: number
  parent_grid: number | null
  parent_id: string | null
  width: number
  height: number
  prompt: string
  username: string | null
  user_id: string
  published: boolean
  liked_by_user: boolean
  jobFiltered: boolean
  images: Image[]
}

export function isUpscale(eventType: EventType) {
  return eventType != null && eventType.includes('upsample')
}

export function getJobImageUrl(
  job: ImagineJobData,
  index: number | null,
  size: string = 'original',
) {
  const seed = job.id.slice(0, 8) + (index ?? 0)
  const w = size === 'original' || size === 'large' ? 640 : size === 'medium' ? 384 : 200
  return `https://picsum.photos/seed/${seed}/${w}/${Math.round(w / (job.width / job.height))}`
}

export function getJobImageOpinionatedThumbnailUrl(job: ImagineJobData, index: number) {
  return getJobImageUrl(job, index, 'medium')
}

export type GlobalJobData = any
export type ImagineJobActions = any

export type Filter = {
  rating: { unrated: boolean; hated: boolean; mehd: boolean; liked: boolean; loved: boolean }
  type: { grid: boolean; upscale: boolean }
  gridImageStyle: 'contain' | 'cover'
}

export const defaultFilter: Filter = {
  rating: { unrated: true, hated: false, mehd: false, liked: true, loved: true },
  type: { grid: true, upscale: true },
  gridImageStyle: 'cover',
}

function makeImage(): Image {
  return { rating: null, filtered: false, selected: false }
}

export const fakeJobs: ImagineJobData[] = [
  { progressStatus: 'completed', id: 'ad3733c7-1c59-45a9-94fe-5580490ee910', event_type: 'diffusion_upsample_v5_2x', enqueue_time: Date.now() - 1000, parent_grid: 0, parent_id: 'p1', width: 1344, height: 896, prompt: 'sea king', username: 'test', user_id: 'u1', published: false, liked_by_user: false, jobFiltered: false, images: [makeImage()] },
  { progressStatus: 'completed', id: '9060008d-eb56-46dd-9207-6c08a2dc7663', event_type: 'diffusion_upsample_v5_2x', enqueue_time: Date.now() - 2000, parent_grid: 0, parent_id: 'p2', width: 896, height: 1344, prompt: 'woman face left', username: 'test', user_id: 'u1', published: false, liked_by_user: false, jobFiltered: false, images: [makeImage()] },
  { progressStatus: 'completed', id: '31b85d22-4f8b-4d64-88e9-895e9db97d62', event_type: 'diffusion_upsample_v5_2x', enqueue_time: Date.now() - 3000, parent_grid: 0, parent_id: 'p3', width: 1024, height: 1024, prompt: 'woman face right', username: 'test', user_id: 'u1', published: false, liked_by_user: false, jobFiltered: false, images: [makeImage()] },
  { progressStatus: 'completed', id: 'aaa11111-aaaa-aaaa-aaaa-aaaaaaaaaaaa', event_type: 'diffusion', enqueue_time: Date.now() - 4000, parent_grid: null, parent_id: null, width: 1344, height: 896, prompt: 'A cozy cabin in the woods', username: 'test', user_id: 'u1', published: false, liked_by_user: false, jobFiltered: false, images: [makeImage(), makeImage(), makeImage(), makeImage()] },
  { progressStatus: 'completed', id: 'bbb22222-bbbb-bbbb-bbbb-bbbbbbbbbbbb', event_type: 'diffusion_upsample_v5_2x', enqueue_time: Date.now() - 5000, parent_grid: 0, parent_id: 'p5', width: 1024, height: 1024, prompt: 'Neon cyberpunk cityscape', username: 'test', user_id: 'u1', published: false, liked_by_user: false, jobFiltered: false, images: [makeImage()] },
  { progressStatus: 'completed', id: 'ccc33333-cccc-cccc-cccc-cccccccccccc', event_type: 'diffusion', enqueue_time: Date.now() - 6000, parent_grid: null, parent_id: null, width: 896, height: 1344, prompt: 'Underwater coral reef', username: 'test', user_id: 'u1', published: false, liked_by_user: false, jobFiltered: false, images: [makeImage(), makeImage(), makeImage(), makeImage()] },
  { progressStatus: 'completed', id: 'ddd44444-dddd-dddd-dddd-dddddddddddd', event_type: 'diffusion_upsample_v5_2x', enqueue_time: Date.now() - 7000, parent_grid: 0, parent_id: 'p7', width: 1344, height: 896, prompt: 'Mountain landscape golden hour', username: 'test', user_id: 'u1', published: false, liked_by_user: false, jobFiltered: false, images: [makeImage()] },
  { progressStatus: 'completed', id: 'eee55555-eeee-eeee-eeee-eeeeeeeeeeee', event_type: 'diffusion', enqueue_time: Date.now() - 8000, parent_grid: null, parent_id: null, width: 1024, height: 1024, prompt: 'Abstract geometric patterns', username: 'test', user_id: 'u1', published: false, liked_by_user: false, jobFiltered: false, images: [makeImage(), makeImage(), makeImage(), makeImage()] },
  { progressStatus: 'completed', id: 'fff66666-ffff-ffff-ffff-ffffffffffff', event_type: 'diffusion_upsample_v5_2x', enqueue_time: Date.now() - 9000, parent_grid: 0, parent_id: 'p9', width: 896, height: 1344, prompt: 'Vintage Japanese woodblock print', username: 'test', user_id: 'u1', published: false, liked_by_user: false, jobFiltered: false, images: [makeImage()] },
  { progressStatus: 'completed', id: 'ggg77777-gggg-gggg-gggg-gggggggggggg', event_type: 'diffusion', enqueue_time: Date.now() - 10000, parent_grid: null, parent_id: null, width: 1344, height: 896, prompt: 'Steampunk airship above clouds', username: 'test', user_id: 'u1', published: false, liked_by_user: false, jobFiltered: false, images: [makeImage(), makeImage(), makeImage(), makeImage()] },
]
