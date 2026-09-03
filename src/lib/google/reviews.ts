import { z } from 'zod';

const localizedTextSchema = z.object({
  text: z.string().optional(),
  languageCode: z.string().optional(),
});

const placeDetailsSchema = z.object({
  id: z.string().optional(),
  displayName: localizedTextSchema.optional(),
  rating: z.number().optional(),
  userRatingCount: z.number().int().nonnegative().optional(),
  googleMapsUri: z.string().url().optional(),
  reviews: z
    .array(
      z.object({
        name: z.string().optional(),
        relativePublishTimeDescription: z.string().optional(),
        text: localizedTextSchema.optional(),
        originalText: localizedTextSchema.optional(),
        rating: z.number().optional(),
        publishTime: z.string().optional(),
        googleMapsUri: z.string().url().optional(),
        authorAttribution: z
          .object({
            displayName: z.string().optional(),
            uri: z.string().url().optional(),
            photoUri: z.string().url().optional(),
          })
          .optional(),
      }),
    )
    .optional(),
});

export type GoogleReview = {
  id: string;
  authorName: string;
  authorUri?: string;
  authorPhotoUri?: string;
  rating: number;
  text: string;
  publishedAt?: string;
  relativeTime?: string;
  reviewUri?: string;
};

export type GoogleReviewsPayload = {
  configured: boolean;
  source: 'google' | 'fallback';
  placeName: string;
  rating: number;
  userRatingCount: number;
  googleMapsUri: string;
  reviews: GoogleReview[];
};

export const fallbackGoogleReviews: GoogleReviewsPayload = {
  configured: false,
  source: 'fallback',
  placeName: 'Autoškola BuBu Praha 8 Střížkov',
  rating: 5,
  userRatingCount: 28,
  googleMapsUri:
    'https://www.google.com/maps/search/?api=1&query=Auto%C5%A1kola%20BuBu%20U%20Kapli%C4%8Dek%2034%20Praha%208%20St%C5%99%C3%AD%C5%BEkov',
  reviews: [
    {
      id: 'fallback-approach',
      authorName: 'Google recenze',
      rating: 5,
      text: 'Žáci u nás nejčastěji oceňují klidný přístup, srozumitelné vysvětlení a přípravu na reálný provoz.',
      relativeTime: 'veřejný profil Google',
    },
    {
      id: 'fallback-profile',
      authorName: 'Profil pobočky Střížkov',
      rating: 5,
      text: 'Po napojení Google Places API se zde budou automaticky zobrazovat aktuální recenze z profilu Autoškola BuBu Střížkov.',
      relativeTime: 'čeká na API klíč',
    },
  ],
};

export async function loadGoogleReviews(env: Record<string, string | undefined>) {
  const apiKey = env.GOOGLE_PLACES_API_KEY;
  const placeId = env.GOOGLE_PLACE_ID_STRIZKOV || env.GOOGLE_REVIEWS_PLACE_ID;
  if (!apiKey || !placeId) return fallbackGoogleReviews;

  try {
    const response = await fetch(
      `https://places.googleapis.com/v1/places/${encodeURIComponent(placeId)}?languageCode=cs&regionCode=CZ`,
      {
        headers: {
          'X-Goog-Api-Key': apiKey,
          'X-Goog-FieldMask':
            'id,displayName,rating,userRatingCount,googleMapsUri,reviews.name,reviews.text,reviews.originalText,reviews.rating,reviews.publishTime,reviews.relativePublishTimeDescription,reviews.googleMapsUri,reviews.authorAttribution.displayName,reviews.authorAttribution.uri,reviews.authorAttribution.photoUri',
        },
        signal: AbortSignal.timeout(8000),
      },
    );

    if (!response.ok) return fallbackGoogleReviews;

    const place = placeDetailsSchema.parse(await response.json());
    const reviews = (place.reviews ?? [])
      .map((review, index): GoogleReview => {
        const text = review.text?.text || review.originalText?.text || '';
        return {
          id: review.name ?? `review-${index}`,
          authorName: review.authorAttribution?.displayName ?? 'Google uživatel',
          authorUri: review.authorAttribution?.uri,
          authorPhotoUri: review.authorAttribution?.photoUri,
          rating: review.rating ?? 5,
          text,
          publishedAt: review.publishTime,
          relativeTime: review.relativePublishTimeDescription,
          reviewUri: review.googleMapsUri,
        };
      })
      .filter((review) => review.text.trim().length > 0)
      .slice(0, 5);

    return {
      configured: true,
      source: 'google' as const,
      placeName: place.displayName?.text ?? fallbackGoogleReviews.placeName,
      rating: place.rating ?? fallbackGoogleReviews.rating,
      userRatingCount: place.userRatingCount ?? fallbackGoogleReviews.userRatingCount,
      googleMapsUri: place.googleMapsUri ?? fallbackGoogleReviews.googleMapsUri,
      reviews: reviews.length ? reviews : fallbackGoogleReviews.reviews,
    } satisfies GoogleReviewsPayload;
  } catch {
    return fallbackGoogleReviews;
  }
}
