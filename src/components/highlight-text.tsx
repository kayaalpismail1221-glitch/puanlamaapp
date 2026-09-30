import type { ComponentProps } from 'react';

import { Text } from '@/components/ui';
import { colors } from '@/constants/theme';
import { splitMatch } from '@/lib/fold';

/**
 * Aramada yazılan kısmı vurgular: "Kadı" yazınca "**Kadı**köy". Türkçe harfsiz yazım da eşleşir.
 * Eşleşme yoksa ya da arama boşsa metin olduğu gibi çizilir.
 */
export function HighlightText({
  text,
  query,
  ...props
}: { text: string; query?: string } & Omit<ComponentProps<typeof Text>, 'children'>) {
  const parts = query ? splitMatch(text, query) : undefined;
  if (!parts) return <Text {...props}>{text}</Text>;
  return (
    <Text {...props} color={props.color ?? colors.textSecondary}>
      {parts[0]}
      <Text variant={props.variant} color={colors.text} style={{ fontWeight: '700' }}>
        {parts[1]}
      </Text>
      {parts[2]}
    </Text>
  );
}
