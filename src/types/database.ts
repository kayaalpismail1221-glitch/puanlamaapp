/**
 * Veritabanı tipleri (supabase/migrations ile birebir).
 * `npx supabase gen types typescript --project-id <id> > src/types/database.ts` ile yeniden üretilebilir;
 * biçim o komutun çıktısıyla aynıdır.
 */

export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

type Sentiment = 'liked' | 'fine' | 'disliked';
type SaveOrigin = 'social' | 'app';
type PriceBucket = 'u250' | '250-500' | '500-1000' | '1000-2000' | 'o2000';
type Meal = 'kahvalti' | 'ogle' | 'aksam' | 'gece';
type ReportReason = 'spam' | 'offensive' | 'fake' | 'other';

export type ProfileRow = {
  id: string;
  username: string;
  name: string;
  avatar_path: string | null;
  school_id: string | null;
  year_goal: number | null;
  onboarded_at: string | null;
  follower_count: number;
  following_count: number;
  post_count: number;
  created_at: string;
  updated_at: string;
  search_text: string;
};

export type PlaceRow = {
  id: string;
  name: string;
  cuisine: string;
  neighborhood: string;
  district: string;
  city: string;
  price_level: number;
  latitude: number;
  longitude: number;
  location: unknown;
  photo_url: string | null;
  source: string;
  external_id: string | null;
  created_by: string | null;
  created_at: string;
  search_text: string;
};

/** place_view satırı (görünümlerde gömülü `place` alanı da bu biçimde) */
export type PlaceViewRow = {
  id: string;
  name: string;
  cuisine: string;
  neighborhood: string;
  district: string;
  city: string;
  price_level: number;
  latitude: number;
  longitude: number;
  photo: string | null;
};

/** profile_json(): herkese açık profil alanları */
export type PublicProfileJson = {
  id: string;
  username: string;
  name: string;
  avatar_path: string | null;
  school_id: string | null;
};

export type ProfileViewRow = PublicProfileJson & {
  follower_count: number;
  following_count: number;
  post_count: number;
  created_at: string;
  is_following: boolean;
  follows_me: boolean;
};

export type PostViewRow = {
  id: string;
  user_id: string;
  place_id: string;
  caption: string | null;
  score: number | null;
  price_per_person: PriceBucket | null;
  meal: Meal | null;
  dishes: string[];
  highlights: string[];
  like_count: number;
  comment_count: number;
  created_at: string;
  photos: string[];
  tagged: PublicProfileJson[];
  liked_by_me: boolean;
  saved_by_me: boolean;
  author: PublicProfileJson;
  place: PlaceViewRow;
};

export type RankingViewRow = {
  user_id: string;
  place_id: string;
  sentiment: Sentiment;
  position: number;
  score: number;
  note: string | null;
  rated_at: string;
  place: PlaceViewRow;
};

export type SavedPlaceViewRow = {
  user_id: string;
  place_id: string;
  origin: SaveOrigin;
  link: string | null;
  note: string | null;
  saved_at: string;
  place: PlaceViewRow;
};

export type CommentViewRow = {
  id: string;
  post_id: string;
  user_id: string;
  body: string;
  created_at: string;
  author: PublicProfileJson;
};

export type AreaViewRow = {
  city: string;
  district: string;
  latitude: number;
  longitude: number;
  place_count: number;
  post_count: number;
};

export type PopularFeedJson = {
  radius_km: number | null;
  fallback_city: string | null;
  entries: { post: PostViewRow; distance_km: number | null }[];
};

export type PlaceDetailsJson = {
  place: PlaceViewRow;
  rating: { average: number | null; count: number };
  post_count: number;
  summary: {
    price: { key: PriceBucket; count: number } | null;
    price_votes: number;
    highlights: { label: string; count: number }[];
    dishes: { name: string; count: number }[];
  };
  friends: { user: PublicProfileJson; score: number; post_id: string | null }[];
};

export type LeaderboardRow = {
  user_id: string;
  reviews: number;
  likes: number;
  rank: number;
  profile: PublicProfileJson;
};

type Table<Row, Insert = Partial<Row>, Update = Partial<Row>> = {
  Row: Row;
  Insert: Insert;
  Update: Update;
  Relationships: [];
};

type View<Row> = { Row: Row; Relationships: [] };

export type Database = {
  __InternalSupabase: { PostgrestVersion: '12' };
  public: {
    Tables: {
      cuisines: Table<{ name: string; position: number }>;
      profiles: Table<
        ProfileRow,
        never,
        Partial<Pick<ProfileRow, 'name' | 'username' | 'avatar_path' | 'school_id' | 'year_goal' | 'onboarded_at'>>
      >;
      profile_private: Table<
        { user_id: string; phone: string | null; updated_at: string },
        { user_id: string; phone?: string | null },
        { phone?: string | null }
      >;
      places: Table<
        PlaceRow,
        {
          name: string;
          cuisine: string;
          neighborhood?: string;
          district: string;
          city: string;
          price_level?: number;
          latitude: number;
          longitude: number;
        },
        never
      >;
      rankings: Table<{
        user_id: string;
        place_id: string;
        sentiment: Sentiment;
        position: number;
        score: number;
        note: string | null;
        rated_at: string;
      }>;
      saved_places: Table<
        {
          user_id: string;
          place_id: string;
          origin: SaveOrigin;
          link: string | null;
          note: string | null;
          saved_at: string;
        },
        {
          place_id: string;
          origin?: SaveOrigin;
          link?: string | null;
          note?: string | null;
          saved_at?: string;
        },
        {
          origin?: SaveOrigin;
          link?: string | null;
          note?: string | null;
          saved_at?: string;
        }
      >;
      follows: Table<
        { follower_id: string; followee_id: string; created_at: string },
        { followee_id: string },
        never
      >;
      blocks: Table<{ blocker_id: string; blocked_id: string; created_at: string }, { blocked_id: string }, never>;
      posts: Table<
        {
          id: string;
          user_id: string;
          place_id: string;
          caption: string | null;
          score: number | null;
          price_per_person: PriceBucket | null;
          meal: Meal | null;
          dishes: string[];
          highlights: string[];
          like_count: number;
          comment_count: number;
          created_at: string;
          updated_at: string;
        },
        never,
        {
          caption?: string | null;
          price_per_person?: PriceBucket | null;
          meal?: Meal | null;
          dishes?: string[];
          highlights?: string[];
        }
      >;
      post_likes: Table<{ post_id: string; user_id: string; created_at: string }, { post_id: string }, never>;
      post_saves: Table<{ post_id: string; user_id: string; created_at: string }, { post_id: string }, never>;
      post_tags: Table<{ post_id: string; user_id: string }, { post_id: string; user_id: string }, never>;
      comments: Table<
        { id: string; post_id: string; user_id: string; body: string; created_at: string },
        { post_id: string; body: string },
        never
      >;
      reports: Table<
        {
          id: string;
          reporter_id: string;
          post_id: string | null;
          comment_id: string | null;
          user_id: string | null;
          reason: ReportReason;
          details: string | null;
          created_at: string;
          resolved_at: string | null;
        },
        {
          post_id?: string | null;
          comment_id?: string | null;
          user_id?: string | null;
          reason: ReportReason;
          details?: string | null;
        },
        never
      >;
    };
    Views: {
      profile_view: View<ProfileViewRow>;
      place_view: View<PlaceViewRow>;
      post_view: View<PostViewRow>;
      ranking_view: View<RankingViewRow>;
      saved_place_view: View<SavedPlaceViewRow>;
      comment_view: View<CommentViewRow>;
      area_view: View<AreaViewRow>;
    };
    Functions: {
      rank_place: {
        Args: { p_place_id: string; p_sentiment: Sentiment; p_index: number; p_note?: string | null };
        Returns: number;
      };
      unrank_place: { Args: { p_place_id: string }; Returns: undefined };
      friend_scores: {
        Args: { p_place_ids: string[] };
        Returns: { place_id: string; average: number; count: number }[];
      };
      create_post: {
        Args: {
          p_id: string;
          p_place_id: string;
          p_caption?: string | null;
          p_price?: PriceBucket | null;
          p_meal?: Meal | null;
          p_dishes?: string[];
          p_highlights?: string[];
          p_tagged?: string[];
          p_photos?: Json;
        };
        Returns: PostViewRow[];
      };
      list_posts: {
        Args: { p_user_id?: string; p_place_id?: string; p_before?: string; p_limit?: number };
        Returns: PostViewRow[];
      };
      saved_posts: { Args: { p_offset?: number; p_limit?: number }; Returns: PostViewRow[] };
      feed_following: { Args: { p_before?: string; p_limit?: number }; Returns: PostViewRow[] };
      feed_popular: {
        Args: {
          p_latitude?: number;
          p_longitude?: number;
          p_city?: string;
          p_district?: string;
          p_offset?: number;
          p_limit?: number;
        };
        Returns: Json;
      };
      place_details: { Args: { p_place_id: string }; Returns: Json };
      search_places: {
        Args: { p_query?: string; p_latitude?: number; p_longitude?: number; p_limit?: number };
        Returns: PlaceViewRow[];
      };
      search_users: { Args: { p_query: string; p_limit?: number }; Returns: ProfileViewRow[] };
      suggested_users: { Args: { p_limit?: number }; Returns: ProfileViewRow[] };
      followers_of: {
        Args: { p_user_id: string; p_offset?: number; p_limit?: number };
        Returns: ProfileViewRow[];
      };
      following_of: {
        Args: { p_user_id: string; p_offset?: number; p_limit?: number };
        Returns: ProfileViewRow[];
      };
      leaderboard: {
        Args: { p_scope?: string; p_period?: string; p_school_id?: string; p_limit?: number };
        Returns: LeaderboardRow[];
      };
      user_rank: { Args: { p_user_id: string }; Returns: number | null };
      username_available: { Args: { p_username: string }; Returns: boolean };
      delete_account: { Args: Record<string, never>; Returns: undefined };
    };
    Enums: {
      sentiment: Sentiment;
      save_origin: SaveOrigin;
      price_bucket: PriceBucket;
      meal: Meal;
      report_reason: ReportReason;
    };
    CompositeTypes: Record<string, never>;
  };
};
