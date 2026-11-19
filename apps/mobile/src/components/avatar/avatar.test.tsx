import { render, screen } from '@testing-library/react-native';
import { avatar } from '@konvami/design-tokens';
import { Avatar } from './avatar';
import type { ArtPack } from './art-pack';
import type { AvatarLook } from './look';
import { SAMPLE_PACK } from './sample-pack';

const LENA: AvatarLook = {
  skin: 'sand',
  hair: 'long',
  hairColor: 'chestnut',
  top: 'teal',
  backdrop: 'mist',
};

// A pack's SVG layers, seen as plain views that keep the colour they were given.
jest.mock('react-native-svg', () => {
  const { View } = jest.requireActual<typeof import('react-native')>('react-native');
  return {
    __esModule: true,
    ...jest.requireActual<object>('react-native-svg'),
    SvgXml: ({ color }: { color?: string }) => (
      <View testID="pack-layer" accessibilityHint={color} />
    ),
  };
});

const packLayers = async (pack: ArtPack | null) => {
  await render(<Avatar look={LENA} size={120} pack={pack} />);
  return screen.queryAllByTestId('pack-layer', { includeHiddenElements: true });
};

describe('Avatar', () => {
  it('draws the portrait in code without a pack', async () => {
    expect(await packLayers(null)).toHaveLength(0);
  });

  it('draws a pack’s layers with the look’s colours', async () => {
    const layers = await packLayers(SAMPLE_PACK);

    expect(layers.length).toBeGreaterThan(0);
    expect(layers.map((layer) => layer.props.accessibilityHint)).toContain(avatar.skin.sand.base);
  });

  it('falls back to the drawn portrait when the pack cannot draw the look', async () => {
    const unfinished: ArtPack = { id: 'unfinished', name: 'Unfinished', assets: {} };

    expect(await packLayers(unfinished)).toHaveLength(0);
  });
});
