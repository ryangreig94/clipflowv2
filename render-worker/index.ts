/**
 * ClipFlow Render Worker
 * 
 * This worker runs on Railway/Fly.io and handles:
 * - Polling render_tasks table for queued tasks
 * - Downloading source videos
 * - Processing with FFmpeg
 * - Uploading results to Supabase Storage
 * - Updating task/job status
 * 
 * Environment variables required:
 * - SUPABASE_URL
 * - SUPABASE_SERVICE_ROLE_KEY
 * - WORKER_ID (unique identifier for this worker instance)
 */

import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const workerId = process.env.WORKER_ID || `worker-${Date.now()}`;

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
const MAX_ATTEMPTS = 3;
const HEARTBEAT_INTERVAL_MS = 60000; // 60 seconds

interface RenderTask {
  task_id: string;
  task_job_id: string;
  task_user_id: string;
  task_input: Record<string, unknown>;
}

async function claimTask(): Promise<RenderTask | null> {
  const { data, error } = await supabase.rpc('claim_render_task', {
    worker_id_input: workerId,
  });

  if (error) {
    console.error('Error claiming task:', error);
    return null;
  }

  if (!data || data.length === 0) {
    return null;
  }

  const task = data[0];
  return {
    task_id: task.task_id,
    task_job_id: task.task_job_id,
    task_user_id: task.task_user_id,
    task_input: task.task_input,
  };
}

async function updateTaskStatus(
  taskId: string,
  status: 'rendering' | 'done' | 'failed',
  output?: Record<string, unknown>
) {
  const updates: Record<string, unknown> = { status };
  if (output) {
    updates.output = output;
  }

  const { error } = await supabase
    .from('render_tasks')
    .update(updates)
    .eq('id', taskId);

  if (error) {
    console.error('Error updating task status:', error);
  }
}

async function updateJobStatus(
  jobId: string,
  status: 'processing' | 'done' | 'failed',
  renderStatus: 'rendering' | 'done' | 'failed',
  resultUrl?: string,
  errorMsg?: string
) {
  const updates: Record<string, unknown> = { status, render_status: renderStatus };
  if (resultUrl) {
    updates.result_url = resultUrl;
  }
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

async function processTask(task: RenderTask): Promise<void> {
  console.log(`Processing task ${task.task_id} for job ${task.task_job_id}`);
  
  const input = task.task_input;
  const jobType = input.job_type as string;
  
  try {
    // Update job status to processing
    await updateJobStatus(task.task_job_id, 'processing', 'rendering');

    // TODO: Implement actual video processing based on job type
    // For now, simulate processing
    console.log(`Job type: ${jobType}`);
    console.log(`Input:`, JSON.stringify(input, null, 2));

    switch (jobType) {
      case 'ai_short':
        await processAIShort(task);
        break;
      case 'long_form':
        await processLongForm(task);
        break;
      case 'render_clip':
        await processRenderClip(task);
        break;
      default:
        throw new Error(`Unknown job type: ${jobType}`);
    }

    // Mark task as done
    await updateTaskStatus(task.task_id, 'done', { completed_at: new Date().toISOString() });
    await updateJobStatus(task.task_job_id, 'done', 'done');
    
    console.log(`Task ${task.task_id} completed successfully`);

  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : 'Unknown error';
    console.error(`Task ${task.task_id} failed:`, errorMsg);
    
    await updateTaskStatus(task.task_id, 'failed', { error: errorMsg });
    await updateJobStatus(task.task_job_id, 'failed', 'failed', undefined, errorMsg);
  }
}

async function processAIShort(task: RenderTask): Promise<void> {
  const input = task.task_input;
  const keywords = input.keywords as string || '';
  
  // Parse topic and script from keywords
  const topicMatch = keywords.match(/topic:([^|]+)/);
  const scriptMatch = keywords.match(/script:(.+)/);
  
  const topic = topicMatch ? topicMatch[1] : 'general';
  const script = scriptMatch ? scriptMatch[1] : '';
  
  console.log(`Generating AI Short for topic: ${topic}`);
  if (script) {
    console.log(`Custom script: ${script}`);
  }
  
  // TODO: Integrate with AI service for script generation
  // TODO: Integrate with TTS service for voiceover
  // TODO: Integrate with image/video generation service
  // TODO: Use FFmpeg to composite final video
  
  // Simulate processing time
  await new Promise(resolve => setTimeout(resolve, 2000));
  
  // TODO: Upload to Supabase Storage and return URL
  console.log('AI Short processing complete (simulated)');
}

async function processLongForm(task: RenderTask): Promise<void> {
  const input = task.task_input;
  const sourceUrl = input.source_url as string;
  
  console.log(`Processing long-form video from: ${sourceUrl}`);
  
  // TODO: Download video using yt-dlp
  // TODO: Use AI to detect viral moments
  // TODO: Extract clips using FFmpeg
  // TODO: Upload clips to Supabase Storage
  
  // Simulate processing time
  await new Promise(resolve => setTimeout(resolve, 3000));
  
  console.log('Long-form processing complete (simulated)');
}

async function processRenderClip(task: RenderTask): Promise<void> {
  const input = task.task_input;
  
  console.log(`Rendering clip with input:`, input);
  
  // TODO: Download source clip
  // TODO: Apply styling/branding
  // TODO: Render with FFmpeg
  // TODO: Upload to Supabase Storage
  
  // Simulate processing time
  await new Promise(resolve => setTimeout(resolve, 1500));
  
  console.log('Clip rendering complete (simulated)');
}

async function sendHeartbeat() {
  try {
    const { error } = await supabase.from('worker_heartbeat').insert({
      source: workerId,
      message: 'Render worker alive',
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
  console.log(`ClipFlow Render Worker started (ID: ${workerId})`);
  console.log(`Supabase URL: ${supabaseUrl}`);
  console.log(`Polling interval: ${POLL_INTERVAL_MS}ms`);
  console.log(`Heartbeat interval: ${HEARTBEAT_INTERVAL_MS}ms`);
  
  // Send initial heartbeat
  await sendHeartbeat();
  
  // Set up heartbeat interval
  setInterval(sendHeartbeat, HEARTBEAT_INTERVAL_MS);
  
  while (true) {
    try {
      const task = await claimTask();
      
      if (task) {
        await processTask(task);
      } else {
        // No tasks available, wait before polling again
        await new Promise(resolve => setTimeout(resolve, POLL_INTERVAL_MS));
      }
    } catch (error) {
      console.error('Worker error:', error);
      await new Promise(resolve => setTimeout(resolve, POLL_INTERVAL_MS));
    }
  }
}

main().catch(console.error);
