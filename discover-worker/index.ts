/**
 * ClipFlow Discovery Worker
 * 
 * This worker runs on Railway/Fly.io and handles:
 * - Polling video_processing_jobs for discover jobs
 * - Searching platforms (Twitch, YouTube, Rumble) for viral content
 * - Creating candidate clips for rendering
 * 
 * Environment variables required:
 * - SUPABASE_URL
 * - SUPABASE_SERVICE_ROLE_KEY
 * - WORKER_ID (unique identifier for this worker instance)
 * - TWITCH_CLIENT_ID (optional)
 * - TWITCH_CLIENT_SECRET (optional)
 * - YOUTUBE_API_KEY (optional)
 */

import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const workerId = process.env.WORKER_ID || `discover-${Date.now()}`;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('Missing required environment variables: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
});

const POLL_INTERVAL_MS = 5000; // 5 seconds
const HEARTBEAT_INTERVAL_MS = 60000; // 60 seconds

interface DiscoverJob {
  id: string;
  user_id: string;
  source_platform: string | null;
  source_query: string | null;
  category: string | null;
  keywords: string | null;
}

async function claimDiscoverJob(): Promise<DiscoverJob | null> {
  // Atomically claim the oldest ready discover job
  const { data, error } = await supabase
    .from('video_processing_jobs')
    .update({ 
      status: 'processing',
      updated_at: new Date().toISOString()
    })
    .eq('job_type', 'discover')
    .eq('status', 'ready')
    .order('created_at', { ascending: true })
    .limit(1)
    .select()
    .single();

  if (error) {
    if (error.code !== 'PGRST116') { // No rows found
      console.error('Error claiming discover job:', error);
    }
    return null;
  }

  return data as DiscoverJob;
}

async function updateJobStatus(
  jobId: string,
  status: 'processing' | 'done' | 'failed',
  errorMsg?: string
) {
  const updates: Record<string, unknown> = { status };
  if (errorMsg) {
    updates.error = errorMsg;
  }

  const { error } = await supabase
    .from('video_processing_jobs')
    .update(updates)
    .eq('id', jobId);

  if (error) {
    console.error('Error updating job status:', error);
  }
}

async function createClipJob(
  userId: string,
  parentJobId: string,
  clip: {
    title: string;
    source_url: string;
    source_platform: string;
    viral_score: number;
    duration?: number;
    thumbnail_url?: string;
  }
) {
  const { error } = await supabase.from('video_processing_jobs').insert({
    user_id: userId,
    job_type: 'render_clip',
    source_platform: clip.source_platform,
    source_url: clip.source_url,
    title: clip.title,
    viral_score: clip.viral_score,
    duration: clip.duration,
    thumbnail_url: clip.thumbnail_url,
    status: 'ready',
    render_status: 'queued',
    keywords: `parent:${parentJobId}`,
  });

  if (error) {
    console.error('Error creating clip job:', error);
  }
}

async function processDiscoverJob(job: DiscoverJob): Promise<void> {
  console.log(`Processing discover job ${job.id}`);
  console.log(`Platform: ${job.source_platform}, Query: ${job.source_query}, Category: ${job.category}`);
  
  try {
    const platform = job.source_platform || 'all';
    const query = job.source_query || job.keywords || '';
    const category = job.category || 'gaming';
    
    // TODO: Implement actual platform API calls
    // For now, generate simulated clips
    const clips = await discoverClips(platform, query, category, job.user_id, job.id);
    
    console.log(`Found ${clips.length} clips`);
    
    // Create render jobs for each discovered clip
    for (const clip of clips) {
      await createClipJob(job.user_id, job.id, clip);
    }
    
    await updateJobStatus(job.id, 'done');
    console.log(`Discover job ${job.id} completed`);
    
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : 'Unknown error';
    console.error(`Discover job ${job.id} failed:`, errorMsg);
    await updateJobStatus(job.id, 'failed', errorMsg);
  }
}

async function discoverClips(
  platform: string,
  query: string,
  category: string,
  userId: string,
  parentJobId: string
): Promise<Array<{
  title: string;
  source_url: string;
  source_platform: string;
  viral_score: number;
  duration?: number;
  thumbnail_url?: string;
}>> {
  // TODO: Implement actual platform discovery
  // - Twitch: Use Twitch API to find popular clips
  // - YouTube: Use YouTube API to search for trending shorts
  // - Rumble: Use Rumble API/scraping for viral content
  
  // Simulate discovery process
  await new Promise(resolve => setTimeout(resolve, 2000));
  
  // Return simulated clips based on category
  const clipTemplates: Record<string, string[]> = {
    gaming: [
      'Insane clutch play in ranked',
      'World first boss kill reaction',
      'Funniest rage quit ever',
      'Pro player gets outplayed',
      'Crazy speedrun skip discovered',
    ],
    comedy: [
      'Stand-up comedy gold moment',
      'Hilarious fail compilation',
      'Comedian roasts audience member',
      'Unexpected plot twist reaction',
      'Best improv moment of the night',
    ],
    podcast: [
      'Mind-blowing fact revealed',
      'Guest drops bombshell',
      'Host can\'t stop laughing',
      'Controversial take goes viral',
      'Expert explains complex topic simply',
    ],
    sports: [
      'Unbelievable goal from midfield',
      'Last second buzzer beater',
      'Record-breaking performance',
      'Player mic\'d up moment',
      'Coach\'s epic halftime speech',
    ],
    news: [
      'Breaking news moment',
      'Reporter keeps composure',
      'Interviewee walks off set',
      'Live news blooper',
      'Anchor\'s honest reaction',
    ],
  };
  
  const titles = clipTemplates[category] || clipTemplates.gaming;
  const actualPlatform = platform === 'all' ? ['twitch', 'youtube', 'rumble'][Math.floor(Math.random() * 3)] : platform;
  
  // Return 3-5 simulated clips
  const numClips = Math.floor(Math.random() * 3) + 3;
  const clips = [];
  
  for (let i = 0; i < numClips; i++) {
    clips.push({
      title: `${titles[i % titles.length]} - ${query || category}`,
      source_url: `https://${actualPlatform}.example.com/clip/${Date.now()}-${i}`,
      source_platform: actualPlatform,
      viral_score: Math.floor(Math.random() * 30) + 70, // 70-100
      duration: Math.floor(Math.random() * 45) + 15, // 15-60 seconds
    });
  }
  
  return clips;
}

async function sendHeartbeat() {
  try {
    const { error } = await supabase.from('worker_heartbeat').insert({
      source: workerId,
      message: 'Discover worker alive',
    });
    
    if (error) {
      console.error('Heartbeat failed:', error);
    } else {
      console.log(`Heartbeat sent from ${workerId}`);
    }
  } catch (err) {
    console.error('Heartbeat error:', err);
  }
}

async function main() {
  console.log(`ClipFlow Discover Worker started (ID: ${workerId})`);
  console.log(`Supabase URL: ${supabaseUrl}`);
  console.log(`Polling interval: ${POLL_INTERVAL_MS}ms`);
  console.log(`Heartbeat interval: ${HEARTBEAT_INTERVAL_MS}ms`);
  
  // Send initial heartbeat
  await sendHeartbeat();
  
  // Set up heartbeat interval
  setInterval(sendHeartbeat, HEARTBEAT_INTERVAL_MS);
  
  while (true) {
    try {
      const job = await claimDiscoverJob();
      
      if (job) {
        await processDiscoverJob(job);
      } else {
        // No jobs available, wait before polling again
        await new Promise(resolve => setTimeout(resolve, POLL_INTERVAL_MS));
      }
    } catch (error) {
      console.error('Worker error:', error);
      await new Promise(resolve => setTimeout(resolve, POLL_INTERVAL_MS));
    }
  }
}

main().catch(console.error);
