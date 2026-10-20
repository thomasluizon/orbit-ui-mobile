/** The step-up pattern: a SECURITY SHAPE, not a layout. It states that a fresh sign-in is needed and
 *  carries exactly one action that HANDS OFF to the real sign-in surface.
 *
 *  TWO step-up operations exist in the product, and this is the only shape either may take - in Perfil,
 *  and as the StepUp outcome inside an Astra conversation block alike:
 *    account deletion  the real emailed-code challenge (AuthController.cs 295-325: request-deletion, then
 *                      confirm-deletion).
 *    API keys          ruled step-up by Thomas; the backend check does NOT exist yet (api ticket #342), so
 *                      the component is ahead of the backend here.
 *  BILLING IS NOT A STEP-UP OPERATION. It hands off to the Stripe customer portal, which authenticates the
 *  person itself; a code before opening a portal that will authenticate them anyway is friction that buys
 *  no security. Do not add it back.
 *
 *  If a screen's `message` states any duration or count, the deletion challenge's real numbers are 10
 *  minutes, 3 attempts, and a 60 second cooldown (RequestAccountDeletionCommand.cs 33 and 44,
 *  AppConstants.cs 42). The 5-minute / 5-attempt figures belong to the MCP agent path
 *  (AgentPlatformSettings.cs) and are a DIFFERENT flow - never state those here.
 *
 *  IT CANNOT HOLD A CREDENTIAL FIELD, STRUCTURALLY. There is no children prop and no slot of any kind, and
 *  every prop is a string, a boolean or a handler - there is no prop a node can pass through, so a password
 *  box cannot be nested into it by any caller. That is deliberate and it is the component's reason to
 *  exist: a credential field inside a chat or a settings card is the shape of a phishing screen, and prose
 *  has lost to this class of defect twice in this project. The type is the fence now. Never "fix" this by
 *  adding a children or content prop.
 *
 *  It is a boundary, not an error: neutral tokens, never --status-bad, and the person's session is not a
 *  mistake they made. The one action is the next action, so it takes the accent fill.
 *  `message` and `actionLabel` are REQUIRED with no defaults: the words are the caller's, in the screen's
 *  locale, so no language ships by omission.
 *  States: default · busy (the hand-off is in flight; the button carries it) · hover, focus and active
 *  belong to the button · disabled does not apply (a step-up that cannot be started is not shown) · error
 *  belongs to the sign-in surface it hands off to, never to this notice. */
export interface StepUpProps {
  /** states that a fresh sign-in is needed, e.g. "Essa ação pede que você entre de novo." REQUIRED. */
  message: string;
  /** the one hand-off action's label, e.g. "Entrar de novo". REQUIRED. */
  actionLabel: string;
  /** hands off to the real sign-in surface. It NEVER collects anything itself. */
  onAction: () => void;
  /** the hand-off is in flight */
  busy?: boolean;
}
export declare function StepUp(props: StepUpProps): any;
