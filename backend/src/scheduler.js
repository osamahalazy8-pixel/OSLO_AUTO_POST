import cron from 'node-cron';
import { config } from './config.js';
import { supabase } from './supabase.js';
import { getTikTokPublishStatus, publishToPlatform } from './platforms/publish.js';

let running = false;

async function processDueDeliveries() {
  if (running) return;
  running = true;
  try {
    const now = new Date().toISOString();
    const staleBefore = new Date(Date.now() - 15 * 60 * 1000).toISOString();
    const { data: interrupted, error: recoveryError } = await supabase
      .from('post_deliveries')
      .update({
        status: 'failed',
        error_message: 'Publishing was interrupted for more than 15 minutes. Check the platform before scheduling this content again.',
        claimed_at: null,
        updated_at: now
      })
      .eq('status', 'publishing')
      .lt('claimed_at', staleBefore)
      .select('id');
    if (recoveryError) throw recoveryError;
    if (interrupted?.length) {
      console.error(`Marked ${interrupted.length} interrupted delivery(s) as failed for manual review.`);
    }

    const { data: due, error } = await supabase
      .from('post_deliveries')
      .select('id, post_id, account_id, platform, attempts, scheduled_posts!inner(id, caption, media_path, media_mime_type, media_items, status)')
      .eq('status', 'scheduled')
      .lte('scheduled_at', now)
      .order('scheduled_at', { ascending: true })
      .limit(25);

    if (error) throw error;
    for (const delivery of due || []) {
      const { data: claimed, error: claimError } = await supabase
        .from('post_deliveries')
        .update({
          status: 'publishing',
          attempts: delivery.attempts + 1,
          claimed_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        })
        .eq('id', delivery.id)
        .eq('status', 'scheduled')
        .select('id')
        .maybeSingle();
      if (claimError) {
        console.error('Could not claim scheduled delivery:', claimError.message);
        continue;
      }
      if (!claimed) continue;

      try {
        const post = Array.isArray(delivery.scheduled_posts)
          ? delivery.scheduled_posts[0]
          : delivery.scheduled_posts;
        const { data: account, error: accountError } = await supabase
          .from('social_accounts')
          .select('id, platform, account_id, access_token_enc, metadata')
          .eq('id', delivery.account_id)
          .single();
        if (accountError) throw accountError;
        let mediaItems = [];
        if (Array.isArray(post.media_items) && post.media_items.length) {
          for (const item of post.media_items) {
            const variant = item.variants?.[delivery.platform];
            if (!variant?.path) {
              throw new Error(`No prepared media variant exists for ${delivery.platform}.`);
            }
            const { data, error } = await supabase.storage
              .from(config.storageBucket)
              .createSignedUrl(variant.path, 60 * 60);
            if (error) throw error;
            mediaItems.push({ url: data.signedUrl, mimeType: variant.mimeType });
          }
        } else if (post.media_path) {
          const { data, error } = await supabase.storage
            .from(config.storageBucket)
            .createSignedUrl(post.media_path, 60 * 60);
          if (error) throw error;
          mediaItems = [{ url: data.signedUrl, mimeType: post.media_mime_type || '' }];
        }

        const publishResult = await publishToPlatform(
          delivery.platform,
          account,
          post.caption,
          mediaItems
        );
        const isProcessing = delivery.platform === 'tiktok';
        const { error: updateError } = await supabase
          .from('post_deliveries')
          .update({
            status: isProcessing ? 'processing' : 'published',
            platform_post_id: isProcessing ? publishResult.processingId : publishResult,
            published_at: isProcessing ? null : new Date().toISOString(),
            error_message: null,
            claimed_at: null,
            updated_at: new Date().toISOString()
          })
          .eq('id', delivery.id);
        if (updateError) throw updateError;
      } catch (error) {
        console.error(`Delivery ${delivery.id} failed:`, error.message);
        const { error: updateError } = await supabase
          .from('post_deliveries')
          .update({
            status: 'failed',
            error_message: String(error.message).slice(0, 2000),
            claimed_at: null,
            updated_at: new Date().toISOString()
          })
          .eq('id', delivery.id);
        if (updateError) console.error('Could not mark delivery as failed:', updateError.message);
      }
    }
    await pollTikTokDeliveries();
    await refreshParentStatuses();
  } catch (error) {
    console.error('Scheduler run failed:', error.message);
  } finally {
    running = false;
  }
}

async function pollTikTokDeliveries() {
  const { data: pending, error } = await supabase
    .from('post_deliveries')
    .select('id, account_id, platform_post_id')
    .eq('platform', 'tiktok')
    .eq('status', 'processing')
    .limit(25);
  if (error) throw error;

  for (const delivery of pending || []) {
    const now = new Date().toISOString();
    const { data: claimed, error: claimError } = await supabase
      .from('post_deliveries')
      .update({ status: 'publishing', claimed_at: now, updated_at: now })
      .eq('id', delivery.id)
      .eq('status', 'processing')
      .select('id')
      .maybeSingle();
    if (claimError) {
      console.error('Could not claim TikTok status check:', claimError.message);
      continue;
    }
    if (!claimed) continue;

    try {
      const { data: account, error: accountError } = await supabase
        .from('social_accounts')
        .select('id, platform, account_id, access_token_enc, metadata')
        .eq('id', delivery.account_id)
        .single();
      if (accountError) throw accountError;

      const status = await getTikTokPublishStatus(account, delivery.platform_post_id);
      let update;
      if (status?.status === 'PUBLISH_COMPLETE') {
        update = {
          status: 'published',
          platform_post_id: String(status.publicaly_available_post_id?.[0] || delivery.platform_post_id),
          published_at: new Date().toISOString(),
          error_message: null
        };
      } else if (status?.status === 'FAILED') {
        update = {
          status: 'failed',
          error_message: `TikTok publishing failed: ${status.fail_reason || 'No failure reason provided.'}`
        };
      } else if (status?.status === 'SEND_TO_USER_INBOX') {
        update = {
          status: 'failed',
          error_message: 'TikTok sent this content to the creator inbox; complete publishing in the TikTok app.'
        };
      } else {
        update = { status: 'processing', error_message: null };
      }
      const { error: updateError } = await supabase
        .from('post_deliveries')
        .update({ ...update, claimed_at: null, updated_at: new Date().toISOString() })
        .eq('id', delivery.id);
      if (updateError) throw updateError;
    } catch (pollError) {
      console.error(`TikTok status check for delivery ${delivery.id} failed:`, pollError.message);
      const { error: updateError } = await supabase
        .from('post_deliveries')
        .update({
          status: 'processing',
          error_message: String(pollError.message).slice(0, 2000),
          claimed_at: null,
          updated_at: new Date().toISOString()
        })
        .eq('id', delivery.id);
      if (updateError) console.error('Could not restore TikTok delivery after status check:', updateError.message);
    }
  }
}

async function refreshParentStatuses() {
  const { data: posts, error } = await supabase
    .from('scheduled_posts')
    .select('id')
    .in('status', ['scheduled', 'publishing'])
    .limit(100);
  if (error) throw error;

  for (const post of posts || []) {
    const { data: deliveries, error: deliveryError } = await supabase
      .from('post_deliveries')
      .select('status')
      .eq('post_id', post.id);
    if (deliveryError) throw deliveryError;
    const statuses = (deliveries || []).map((item) => item.status);
    let status;
    if (statuses.length && statuses.every((value) => value === 'published')) status = 'published';
    else if (statuses.some((value) => ['publishing', 'processing'].includes(value))) status = 'publishing';
    else if (statuses.some((value) => value === 'scheduled')) status = 'scheduled';
    else if (statuses.some((value) => value === 'failed')) status = 'failed';
    else continue;
    const { error: updateError } = await supabase
      .from('scheduled_posts')
      .update({ status, updated_at: new Date().toISOString() })
      .eq('id', post.id);
    if (updateError) throw updateError;
  }
}

export function startScheduler() {
  if (!config.schedulerEnabled) {
    console.info('Background scheduler disabled by SCHEDULER_ENABLED=false.');
    return;
  }
  cron.schedule('* * * * *', () => {
    void processDueDeliveries();
  }, { timezone: 'UTC' });
  void processDueDeliveries();
  console.info('Background scheduler started (runs every minute, UTC).');
}
