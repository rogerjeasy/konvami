import { useEffect, useState } from 'react';
import { Pressable, View } from 'react-native';
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { size } from '@konvami/design-tokens';
import type { Persona } from '@konvami/api-client';
import { apiErrorCode, apiErrorKey } from '@/api/messages';
import { useSession } from '@/auth';
import { Button } from '@/components/button';
import { Card } from '@/components/card';
import { ConfirmSheet } from '@/components/confirm-sheet';
import { Icon } from '@/components/icon';
import { LoadState } from '@/components/load-state';
import { PressScale, Reveal } from '@/components/motion';
import { NoticeBox } from '@/components/notice-box';
import { PersonaSummary } from '@/components/persona-summary';
import { ActionRow, Sheet } from '@/components/sheet';
import { Text } from '@/components/text';
import { commitFeedback, successFeedback } from '@/lib/haptics';
import { staggerDelay } from '@/lib/motion';
import { callRoute, ROUTES, studioRoute } from '@/lib/routes';
import { MAX_PARTNERS } from '@/profile/persona-draft';
import { usePartnerList, useProfileServices } from '@/profile/services';
import { ProfilePage } from '@/screens/profile/page';
import { useTheme } from '@/theme';

/** One partner: tapping them opens Persona Studio; the dots open what else can be done. */
function PartnerCard({ partner, onMore }: { partner: Persona; onMore: () => void }) {
  const { t } = useTranslation();
  const { color } = useTheme();
  return (
    <Card className="flex-row items-start p-1.5">
      <PressScale
        accessibilityRole="button"
        accessibilityLabel={t('onboarding.partners.editLabel', { name: partner.name })}
        onPress={() => router.push(studioRoute(partner.id))}
        className="flex-1"
        style={{ flex: 1 }}
      >
        <View className="p-2.5">
          <PersonaSummary persona={partner} />
        </View>
      </PressScale>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={t('partners.more', { name: partner.name })}
        onPress={onMore}
        className="min-h-tap min-w-tap items-center justify-center rounded-pill active:opacity-pressed"
      >
        <Icon name="more" color={color.fgMuted} size={size.iconMd} />
      </Pressable>
    </Card>
  );
}

function Partners({ partners }: { partners: Persona[] }) {
  const { t } = useTranslation();
  const { partners: store } = useProfileServices();
  /** The partner whose menu is open, and the one about to be removed. */
  const [menuFor, setMenuFor] = useState<Persona | null>(null);
  const [removing, setRemoving] = useState<Persona | null>(null);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<{ ok: boolean; message: string } | null>(null);

  /** Runs a change on the server and says how it went. */
  async function run(action: () => Promise<string | null>) {
    setNote(null);
    setBusy(true);
    try {
      const message = await action();
      if (message) setNote({ ok: true, message });
      successFeedback();
    } catch (error) {
      setNote({ ok: false, message: t(apiErrorKey(apiErrorCode(error))) });
    } finally {
      setBusy(false);
    }
  }

  const choose = (action: (partner: Persona) => void) => () => {
    const partner = menuFor;
    setMenuFor(null);
    if (partner) action(partner);
  };

  return (
    <>
      {note ? (
        <View accessibilityLiveRegion="polite">
          <NoticeBox icon={note.ok ? 'check' : 'alert'} tone={note.ok ? 'primary' : 'danger'}>
            {note.message}
          </NoticeBox>
        </View>
      ) : null}
      <View className="gap-2.5">
        {partners.map((partner, i) => (
          <Reveal key={partner.id} delay={staggerDelay(i + 1)}>
            <PartnerCard partner={partner} onMore={() => setMenuFor(partner)} />
          </Reveal>
        ))}
      </View>

      <Sheet
        visible={menuFor !== null}
        title={menuFor?.name ?? ''}
        onClose={() => setMenuFor(null)}
      >
        <View className="gap-1">
          <ActionRow
            icon="mic"
            label={t('partners.actions.talk')}
            onPress={choose((partner) => {
              commitFeedback();
              router.push(callRoute(partner.id));
            })}
          />
          <ActionRow
            icon="edit"
            label={t('partners.actions.edit')}
            onPress={choose((partner) => router.push(studioRoute(partner.id)))}
          />
          {partners.length < MAX_PARTNERS ? (
            <ActionRow
              icon="copy"
              label={t('partners.actions.duplicate')}
              onPress={choose(
                (partner) =>
                  void run(async () => {
                    const copy = await store.duplicate(partner.id);
                    return t('partners.copied', { name: copy.name });
                  }),
              )}
            />
          ) : null}
          {partners.length > 1 ? (
            <ActionRow
              danger
              icon="trash"
              label={t('partners.actions.remove')}
              onPress={choose(setRemoving)}
            />
          ) : (
            <View className="pt-1">
              <NoticeBox icon="info">{t('partners.lastOne')}</NoticeBox>
            </View>
          )}
        </View>
      </Sheet>

      <ConfirmSheet
        visible={removing !== null}
        danger
        title={t('partners.removeTitle', { name: removing?.name ?? '' })}
        body={t('partners.removeBody', { name: removing?.name ?? '' })}
        confirmLabel={t('partners.removeYes')}
        cancelLabel={t('partners.removeNo')}
        loading={busy}
        onConfirm={() => {
          const partner = removing;
          if (!partner) return;
          void run(async () => {
            await store.remove(partner.id);
            return null;
          }).finally(() => setRemoving(null));
        }}
        onCancel={() => setRemoving(null)}
      />
    </>
  );
}

/**
 * 6.4 My partners (spec §14.2 "Persona gallery"): the people the learner practises with. Each
 * opens in Persona Studio; their menu talks to them, copies or removes them.
 */
export function PartnersScreen() {
  const { t } = useTranslation();
  const { color } = useTheme();
  const { status } = useSession();
  const { partners: store } = useProfileServices();
  const state = usePartnerList();
  const signedIn = status === 'signedIn';

  useEffect(() => {
    if (signedIn) void store.load();
  }, [signedIn, store]);

  const count = state.phase === 'ready' ? state.partners.length : null;
  const full = count !== null && count >= MAX_PARTNERS;

  return (
    <ProfilePage
      title={t('partners.title')}
      body={t('partners.body')}
      actions={
        state.phase === 'ready' ? (
          <>
            {full ? (
              <View className="pb-2">
                <NoticeBox icon="info">{t('partners.full')}</NoticeBox>
              </View>
            ) : null}
            <Button
              label={t('partners.new')}
              leading={<Icon name="plus" color={color.onPrimary} size={size.iconMd} />}
              disabled={full}
              onPress={() => router.push(ROUTES.accountNewPartner)}
            />
          </>
        ) : undefined
      }
    >
      {state.phase === 'ready' ? (
        <>
          <Text variant="overline" tone="subtle">
            {t('partners.count', { count: state.partners.length, max: MAX_PARTNERS })}
          </Text>
          <Partners partners={state.partners} />
        </>
      ) : (
        <LoadState
          failed={state.phase === 'failed'}
          loadingLabel={t('onboarding.partners.loading')}
          slowLabel={t('common.wakingUp')}
          failedLabel={t(
            state.error === 'network' ? 'errors.network' : 'onboarding.partners.loadFailed',
          )}
          retryLabel={t('common.retry')}
          onRetry={() => void store.reload()}
        />
      )}
    </ProfilePage>
  );
}
