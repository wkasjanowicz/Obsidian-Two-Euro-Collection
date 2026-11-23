import { PluginSettingTab, Setting, Notice } from 'obsidian';
import { tx, isTrue, countryName } from '../utils.js';

export class EuroSettings extends PluginSettingTab {
  constructor(app, plugin) {
    super(app, plugin);
    this.plugin = plugin;
  }
  display() {
    const c = this.containerEl,
      p = this.plugin,
      t = (k, v) => p.t(k, v);
    c.empty();
    c.createEl('h2', { text: t('settings.title') });
    new Setting(c)
      .setName(t('settings.language'))
      .setDesc(t('settings.languageDesc'))
      .addDropdown((d) => {
        d.addOption('auto', t('settings.auto'));
        for (const lang of p.getAvailableLanguages()) d.addOption(lang.code, lang.name);
        d.setValue(p.settings.language || 'auto').onChange(async (v) => {
          p.settings.language = v;
          await p.saveSettings();
          this.display();
        });
      });
    const inp = (key, field, desc = '') =>
      new Setting(c)
        .setName(t(key))
        .setDesc(desc)
        .addText((x) =>
          x.setValue(p.settings[field] || '').onChange(async (v) => {
            p.settings[field] = v;
            await p.saveSettings();
          })
        );
    inp('settings.root', 'rootFolder');
    inp('settings.collection', 'collectionFolder');
    inp('settings.coins', 'coinsFolder');
    inp('settings.covers', 'coversFolder');
    new Setting(c)
      .setName(t('settings.columns'))
      .setDesc(t('settings.columnsDesc'))
      .addSlider((sl) =>
        sl
          .setLimits(4, 10, 1)
          .setValue(Number(p.settings.columns) || 6)
          .setDynamicTooltip()
          .onChange(async (v) => {
            p.settings.columns = v;
            await p.saveSettings();
          })
      );
    new Setting(c).setName(t('settings.apiKey')).addText((x) => {
      x.inputEl.type = 'password';
      x.setValue(p.settings.numistaApiKey || '').onChange(async (v) => {
        p.settings.numistaApiKey = tx(v);
        await p.saveSettings();
      });
    });
    new Setting(c)
      .setName(t('settings.syncUpdateExisting'))
      .setDesc(t('settings.syncUpdateExistingDesc'))
      .addToggle((x) =>
        x.setValue(isTrue(p.settings.syncUpdateExisting)).onChange(async (v) => {
          p.settings.syncUpdateExisting = v;
          await p.saveSettings();
        })
      );
    c.createEl('h3', {
      text: t('settings.initialSetup'),
    });
    // ============================================================
    // Step 1: Create collection structure
    // ============================================================
    new Setting(c)
      .setName(t('settings.initStructure'))
      .setDesc(t('settings.initStructureDesc'))
      .addButton((b) =>
        b
          .setButtonText(t('settings.initStructureButton'))
          .setCta()
          .onClick(async () => {
            await p.ensureDashboard();
            new Notice(t('settings.initStructureDone'));
          })
      );

    // ============================================================
    // Step 2: Initialize reference data
    // ============================================================

    new Setting(c)
      .setName(t('settings.initReferenceData'))
      .setDesc(t('settings.initReferenceDataDesc'))
      .addButton((button) =>
        button
          .setButtonText(t('settings.initReferenceDataButton'))
          .setCta()
          .onClick(async () => {
            const result = await p.initializeReferenceData();

            new Notice(
              t('settings.initReferenceDataDone', {
                issuers: result.issuers,
                years: result.years,
              })
            );

            this.display();
          })
      );

    // ============================================================
    // Step 3: Install starter collection
    // ============================================================
    new Setting(c)
      .setName(t('settings.initStarterPack'))
      .setDesc(t('settings.initStarterPackDesc'))
      .addButton((b) =>
        b.setButtonText(t('settings.initStarterPackButton')).onClick(async () => {
          const confirmed = window.confirm(t('confirm.installStarter'));
          if (!confirmed) return;

          try {
            await p.installStarterCollection();
          } catch (error) {
            console.error('Starter collection installation', error);
            new Notice(error?.message || String(error));
          }
        })
      );
    // ============================================================
    // Reference data
    // ============================================================

    c.createEl('h3', {
      text: t('settings.referenceData'),
    });

    c.createEl('p', {
      text: t('settings.referenceDataDesc'),
    });

    new Setting(c)
      .setName(t('settings.referenceYearFrom'))
      .setDesc(t('settings.referenceYearFromDesc'))
      .addText((text) => {
        text.inputEl.type = 'number';
        text.inputEl.min = '1999';
        text.inputEl.max = '2200';

        text.setValue(String(p.settings.referenceYearFrom || 1999)).onChange(async (value) => {
          const year = Number(value);

          if (!Number.isInteger(year) || year < 1999 || year > 2200) {
            return;
          }

          p.settings.referenceYearFrom = year;
          await p.saveSettings();
          p.refreshFilterViews();
        });
      });

    new Setting(c)
      .setName(t('settings.futureYears'))
      .setDesc(t('settings.futureYearsDesc'))
      .addSlider((slider) =>
        slider
          .setLimits(0, 10, 1)
          .setValue(
            Number.isFinite(Number(p.settings.futureYears)) ? Number(p.settings.futureYears) : 1
          )
          .setDynamicTooltip()
          .onChange(async (value) => {
            p.settings.futureYears = value;
            await p.saveSettings();
            p.refreshFilterViews();
          })
      );

    // ============================================================
    // 12. Add additional issuer
    // ============================================================

    let issuerToAdd = '';

    new Setting(c)
      .setName(t('settings.additionalIssuer'))
      .setDesc(t('settings.additionalIssuerDesc'))
      .addText((text) =>
        text.setPlaceholder(t('settings.issuerPlaceholder')).onChange((value) => {
          issuerToAdd = value;
        })
      )
      .addButton((button) =>
        button
          .setButtonText(t('settings.addIssuerButton'))
          .setCta()
          .onClick(async () => {
            const issuer = countryName(issuerToAdd);

            if (!issuer) {
              return;
            }

            const added = await p.addReferenceIssuer(issuer);

            if (added) {
              new Notice(
                t('settings.issuerAdded', {
                  issuer,
                })
              );

              this.display();
            } else {
              new Notice(t('settings.issuerExists'));
            }
          })
      );
    const additionalIssuers = Array.isArray(p.settings.additionalIssuers)
      ? p.settings.additionalIssuers
      : [];

    if (additionalIssuers.length) {
      c.createEl('h4', {
        text: t('settings.additionalIssuers'),
      });

      for (const issuer of additionalIssuers) {
        new Setting(c).setName(issuer).addButton((button) =>
          button
            .setButtonText(t('settings.removeIssuer'))
            .setWarning()
            .onClick(async () => {
              await p.removeReferenceIssuer(issuer);
              this.display();
            })
        );
      }
    }

    let yearToAdd = '';

    new Setting(c)
      .setName(t('settings.additionalYear'))
      .setDesc(t('settings.additionalYearDesc'))
      .addText((text) => {
        text.inputEl.type = 'number';
        text.inputEl.min = '1999';
        text.inputEl.max = '2200';

        text.setPlaceholder(t('settings.yearPlaceholder')).onChange((value) => {
          yearToAdd = value;
        });
      })
      .addButton((button) =>
        button
          .setButtonText(t('settings.addYearButton'))
          .setCta()
          .onClick(async () => {
            const year = Number(yearToAdd);

            if (!Number.isInteger(year) || year < 1999 || year > 2200) {
              new Notice(t('settings.invalidYear'));
              return;
            }

            const added = await p.addReferenceYear(year);

            if (added) {
              new Notice(
                t('settings.yearAdded', {
                  year,
                })
              );

              this.display();
            } else {
              new Notice(t('settings.yearExists'));
            }
          })
      );

    const additionalYears = Array.isArray(p.settings.additionalYears)
      ? p.settings.additionalYears
      : [];

    if (additionalYears.length) {
      c.createEl('h4', {
        text: t('settings.additionalYears'),
      });

      for (const year of additionalYears) {
        new Setting(c).setName(String(year)).addButton((button) =>
          button
            .setButtonText(t('settings.removeYear'))
            .setWarning()
            .onClick(async () => {
              await p.removeReferenceYear(year);
              this.display();
            })
        );
      }
    }
  }
}
