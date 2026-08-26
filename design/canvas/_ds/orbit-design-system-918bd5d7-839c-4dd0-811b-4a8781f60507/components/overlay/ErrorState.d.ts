/** Data-surface error: one plain message that states the fix, and one action. Calm, no blame, no error codes on the surface. */
export interface ErrorStateProps {
  /** e.g. "Não foi possível carregar seus hábitos. Verifique sua conexão e tente de novo." */
  message: string;
  /** the one action, e.g. <Button size="sm" variant="ghost">Tentar de novo</Button> */
  action?: any;
}
export declare function ErrorState(props: ErrorStateProps): any;
