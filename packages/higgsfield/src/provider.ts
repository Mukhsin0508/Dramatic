import type {
  CancelResult,
  CostEstimate,
  GenerationHandle,
  GenerationSnapshot,
  OperationMap,
  OperationName,
} from "./contracts.js";

export interface ProviderCallContext {
  readonly signal?: AbortSignal;
}

export interface ProviderAccepted<Operation extends string> {
  readonly handle: GenerationHandle<Operation>;
  readonly initial: GenerationSnapshot<Operation>;
}

export interface GenerationProvider<Operations extends OperationMap> {
  readonly name: string;

  estimate<Operation extends OperationName<Operations>>(
    operation: Operation,
    input: Operations[Operation]["input"],
    context: ProviderCallContext,
  ): Promise<CostEstimate>;

  submit<Operation extends OperationName<Operations>>(
    operation: Operation,
    input: Operations[Operation]["input"],
    context: ProviderCallContext,
  ): Promise<ProviderAccepted<Operation>>;

  status<Operation extends OperationName<Operations>>(
    handle: GenerationHandle<Operation>,
    context: ProviderCallContext,
  ): Promise<GenerationSnapshot<Operation>>;

  cancel<Operation extends OperationName<Operations>>(
    handle: GenerationHandle<Operation>,
    context: ProviderCallContext,
  ): Promise<CancelResult>;
}
