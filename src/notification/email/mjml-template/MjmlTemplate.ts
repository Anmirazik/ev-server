import I18nManager from '../../../utils/I18nManager';
import mjml2html from 'mjml';

export default class MjmlTemplate {
  private template: string;

  public constructor(template: string) {
    this.template = template;
  }

  public getTemplate(): string {
    return this.template;
  }

  public getHtml(): string {
    return mjml2html(this.template).html;
  }

  public resolve(i18nManager: I18nManager, context: any, prefix: string): void {
    this.buildComponents(i18nManager, context, prefix);
    this.prepareI18nSelectors(prefix);
    const i18nSelectors = this.getI18nSelectors();
    for (const selector of i18nSelectors) {
      let value = i18nManager.translate(selector, context);
      if (Array.isArray(value)) {
        value = value.join('<br>');
      }
      this.replace(selector, value);
    }

    const contextSelectors = this.getContextSelectors();
    for (const selector of contextSelectors) {
      const keys = this.splitSelector(selector);
      const value = this.getValue(keys, context);
      this.replace(selector, value);
    }
  }

  private buildTable(i18nManager: I18nManager, context: any, prefix: string): void {
    const regex = new RegExp(/_TABLEBUILD/, 'g');
    const match = this.template.match(regex);
    if (!match) {
      return;
    }
    let table = '';
    const tableCases = JSON.parse(JSON.stringify(i18nManager.translate('email.' + prefix + '.table')));
    for (let i = 0; i < tableCases.length; i++) {
      const tableCase = tableCases[i];
      const valueRegex = new RegExp(/\{\{([a-zA-Z0-9_.-]*)\}\}/g);
      const valueSelector = valueRegex.exec(tableCase.value as string);
      const t = tableCase.value.replace(valueSelector[0], context[valueSelector[1]]);
      table = table + `<tr><th style="font-size:18px;font-weight:300">${tableCase.label as string}</th><td style="font-size:18px;font-weight:400;width:50%;text-align:center">${t as string}</td></tr>`;
    }
    this.replace(match[0], table);
  }

  private buildComponents(i18nManager: I18nManager, context: any, prefix: string) {
    this.buildTable(i18nManager, context, prefix);
  }

  private replace(selector: string, value: string): void {
    this.template = this.template.replace('{{' + selector + '}}', value);
  }

  private getContextSelectors(): string[] {
    const regex = new RegExp(/\{\{([a-zA-Z0-9_.-]*)\}\}/, 'g');
    const matches = this.template.matchAll(regex);
    const selectors = [];
    for (const match of matches) {
      selectors.push(match[1]);
    }
    return selectors;
  }

  private getI18nSelectors(): string[] {
    const regex = new RegExp(/\{\{(email..*)\}\}/, 'g');
    const matches = this.template.matchAll(regex);
    const selectors = [];
    for (const match of matches) {
      selectors.push(match[1]);
    }
    return selectors;
  }

  private prepareI18nSelectors(prefix: string): void {
    const i18nRegexCommon = new RegExp(/\{\{i18n:common.(.*)\}\}/, 'g');
    this.template = this.template.replace(i18nRegexCommon, '{{email.$1}}');

    const i18nRegex = new RegExp(/\{\{i18n:(.*)\}\}/, 'g');
    this.template = this.template.replace(i18nRegex, '{{email.' + prefix + '.$1}}');
  }

  private splitSelector(selector: string): string[] {
    return selector.split('.');
  }

  private getValue(keys: string[], context: any): string {
    let value = context;
    for (const key of keys) {
      value = value[key];
    }
    return value;
  }
}