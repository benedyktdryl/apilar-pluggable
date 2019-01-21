import { PluginsRegistry } from './PluginsRegistry';

export class Plugin {
  protected pluginOptions: object;

  public pluginName: string = 'plugin';
  public requires: string[] = [];

  public state: Promise<any> | null = null;

  public onRegistryInitFinish(pluginRegistry: PluginsRegistry): Promise<any> | void {
    return Promise.resolve();
  }

  public init(pluginRegistry: PluginsRegistry): Promise<any> | void {
    return Promise.resolve();
  }

  constructor(pluginOptions = {}) {
    this.pluginOptions = pluginOptions;
  }
}
