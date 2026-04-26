import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_KEY;

let supabaseAdmin = null;
if (supabaseUrl && supabaseServiceKey) {
  supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);
}

const extractNumber = (str) => {
  if (!str) return 0;
  let numStr = str.replace(/,/g, '').toLowerCase();
  
  if (numStr.includes('k')) {
    return parseFloat(numStr.replace('k', '')) * 1000;
  }
  if (numStr.includes('m')) {
    return parseFloat(numStr.replace('m', '')) * 1000000;
  }
  return parseInt(numStr) || 0;
};

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Credentials', true)
  res.setHeader('Access-Control-Allow-Origin', 'https://velo-crm-coral.vercel.app') 
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT')
  res.setHeader(
    'Access-Control-Allow-Headers',
    'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version, Authorization'
  )

  if (req.method === 'OPTIONS') {
    res.status(200).end()
    return
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const { platform, username, token } = req.body

  if (!platform || !username) {
    return res.status(400).json({ error: 'Platform and username are required' })
  }

  const headers = {
    'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/116.0.0.0 Safari/537.36',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
    'Accept-Language': 'en-US,en;q=0.5',
    'Cache-Control': 'no-cache',
    'Pragma': 'no-cache'
  }

  if (!supabaseAdmin) return res.status(500).json({ error: 'Server missing Supabase config' });
  const authHeader = req.headers.authorization;
  if (!authHeader) return res.status(401).json({ error: 'Missing auth header' });
  const userToken = authHeader.replace('Bearer ', '');
  const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(userToken);
  if (authError || !user) return res.status(401).json({ error: 'Unauthorized' });

  try {
    let followers = 0;
    let posts = 0;
    let bio = '';
    let profilePic = '';
    let name = username;
    
    if (platform === 'meta') {
      if (!token) throw new Error('RapidAPI Key missing');
      const resp = await fetch(`https://instagram-scraper-api2.p.rapidapi.com/v1/info?username=${username}`, { 
        headers: { ...headers, 'X-RapidAPI-Key': token } 
      });
      if (!resp.ok) throw new Error('RapidAPI Instagram fetch failed');
      const payload = await resp.json();
      const user = payload?.data || payload;
      followers = user?.follower_count || user?.followers || user?.edge_followed_by?.count || 0;
      posts = user?.media_count || user?.posts || user?.edge_owner_to_timeline_media?.count || 0;
      profilePic = user?.profile_pic_url_hd || user?.profile_pic_url || '';
      bio = user?.biography || user?.bio || '';
      name = user?.full_name || username;

    } else if (platform === 'tiktok') {
      if (!token) throw new Error('RapidAPI Key missing');
      const cleanUsername = username.replace('@', '');
      const resp = await fetch(`https://tiktok-scraper7.p.rapidapi.com/user/info?uniqueId=${cleanUsername}`, { 
        headers: { ...headers, 'X-RapidAPI-Key': token } 
      });
      if (!resp.ok) throw new Error('RapidAPI TikTok fetch failed');
      const payload = await resp.json();
      const user = payload?.data?.user || payload?.user || payload;
      const stats = payload?.data?.stats || payload?.stats || {};
      followers = stats?.followerCount || 0;
      posts = stats?.videoCount || 0;
      profilePic = user?.avatarMedium || user?.avatar || '';
      bio = user?.signature || '';
      name = user?.nickname || username;

    } else if (platform === 'youtube') {
      if (!token) throw new Error('RapidAPI Key missing');
      const cleanUsername = username.replace('@', '');
      const resp = await fetch(`https://youtube-v31.p.rapidapi.com/channels?part=snippet,statistics&forUsername=${cleanUsername}`, { 
        headers: { ...headers, 'X-RapidAPI-Key': token } 
      });
      if (!resp.ok) throw new Error('RapidAPI YouTube fetch failed');
      const vData = await resp.json();
      const channel = vData.items?.[0];
      if (!channel) throw new Error('YouTube channel not found via RapidAPI');
      
      followers = parseInt(channel?.statistics?.subscriberCount) || 0;
      posts = parseInt(channel?.statistics?.videoCount) || 0;
      profilePic = channel?.snippet?.thumbnails?.high?.url || channel?.snippet?.thumbnails?.default?.url || '';
      bio = channel?.snippet?.description || '';
      name = channel?.snippet?.title || username;

    } else if (platform === 'twitter') {
      const activeToken = token || process.env.TWITTER_BEARER_TOKEN;
      if (!activeToken) throw new Error('Twitter requires a bearer token');
      const cleanUsername = username.replace('@', '');
      const resp = await fetch(`https://api.twitter.com/2/users/by/username/${cleanUsername}?user.fields=public_metrics,description,profile_image_url`, {
        headers: { 'Authorization': `Bearer ${activeToken}`, ...headers }
      });
      if (!resp.ok) throw new Error('Twitter API fetch failed');
      const { data } = await resp.json();
      if (!data) throw new Error('Twitter user not found');
      followers = data.public_metrics?.followers_count || 0;
      posts = data.public_metrics?.tweet_count || 0;
      profilePic = data.profile_image_url || '';
      bio = data.description || '';
      name = data.name || cleanUsername;

    } else if (platform === 'snapchat') {
      const resp = await fetch(`https://www.snapchat.com/add/${username}`, { headers });
      if (!resp.ok) throw new Error('Snapchat fetch failed');
      const html = await resp.text();
      const picMatch = html.match(/<meta property="og:image" content="(.*?)"/);
      if (picMatch) profilePic = picMatch[1];
      const nameMatch = html.match(/<meta property="og:title" content="(.*?)"/);
      if (nameMatch) name = nameMatch[1].split(' on Snapchat')[0];
      const descMatch = html.match(/<meta name="description" content="(.*?)"/);
      if (descMatch) bio = descMatch[1];

    } else if (platform === 'google') {
      const apiKey = token || process.env.GOOGLE_PLACES_API_KEY;
      if (!apiKey) throw new Error('Google Places API key missing');
      
      const resp = await fetch(`https://maps.googleapis.com/maps/api/place/textsearch/json?query=${encodeURIComponent(username)}&key=${apiKey}`);
      if (!resp.ok) throw new Error('Google Places API request failed');
      
      const { results } = await resp.json();
      const place = results?.[0];
      if (!place) throw new Error('Place not found matching criteria');
      
      followers = place.user_ratings_total || 0;
      bio = place.formatted_address || '';
      profilePic = place.icon || '';
      name = place.name || username;
      return res.status(200).json({ success: true, followers, posts: 0, bio, profilePic, name, rating: place.rating || 0, place_id: place.place_id });

    } else {
        throw new Error('Unsupported platform in internal fetch');
    }

    return res.status(200).json({ success: true, followers, posts, bio, profilePic, name });
    
  } catch (error) {
    return res.status(500).json({ success: false, error: error.message });
  }
}
