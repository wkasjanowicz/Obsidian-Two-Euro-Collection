'use strict';
const obsidian = require('obsidian');
const { Plugin, PluginSettingTab, Setting, Modal, Notice, ItemView, TFile, normalizePath, requestUrl, parseYaml, stringifyYaml } = obsidian;


const VIEW_TYPE_FILTERS='two-euro-filters-view';
const DEFAULTS = { rootFolder:'11 - Collections', collectionFolder:'2 Euro', coinsFolder:'Coins', coversFolder:'Covers', numistaApiKey:'', columns:6, language:'auto' };
const BASE_LANGUAGE = {
  "command.open": "Open collection",
  "command.add": "Add coin",
  "command.sync": "Synchronize catalogue with Numista",
  "command.covers": "Download missing covers",
  "command.dedupe": "Remove duplicates",
  "command.initFields": "[TEMPORARY] Add reference_year and cover_locked",
  "command.normalizeFolders": "Normalize country folder names",
  "command.migrateCovers": "Migrate cover references",
  "command.removeCurrentBackground": "Remove background from current coin cover",
  "command.catalogPresetCurrent": "Apply Catalog coin preset to current coin",
  "command.normalizeProtectedCovers": "Normalize protected PNG cover names",
  "command.removeUnofficial": "Remove unofficial Numista imports",
  "collection.title": "2 Euro Coin Collection",
  "sidebar.title": "2 Euro Collection",
  "sidebar.open": "Open collection panel",
  "sidebar.actions": "Actions",
  "sidebar.selected": "Selected: {count}",
  "sidebar.clearSelection": "Clear selection",
  "action.removeBackgroundSelected": "Remove background",
  "action.catalogPresetSelected": "Catalog coin",
  "action.processImage": "Process image",
  "action.imagePreset": "Processing preset",
  "action.duplicateSelected": "Duplicate",
  "action.deleteSelected": "Delete",
  "confirm.deleteSelected": "Delete selected coins ({count})? This action cannot be undone.",
  "notice.noSelection": "Select at least one coin first.",
  "notice.batchBackground": "Background removal: completed {done}, skipped {skipped}, errors {errors}.",
  "notice.batchCatalog": "Catalog coin: completed {done}, skipped {skipped}, errors {errors}.",
  "notice.catalogDone": "Catalog coin preset applied. PNG saved and cover locked.",
  "notice.coverNamesNormalized": "Cover names normalized: {renamed}; skipped: {skipped}; errors: {errors}.",
  "confirm.removeUnofficial": "Remove unofficial Numista imports? Owned, locked, custom-cover and manual entries will be preserved.",
  "notice.removeUnofficial": "Unofficial entries removed: {removed}; protected preserved: {protected}; errors: {errors}.",
  "notice.syncOfficial": "Synchronization downloads official 2 euro coins only: standard circulation and circulating commemorative coins.",
  "notice.batchDuplicate": "Duplicates created: {count}.",
  "notice.batchDelete": "Coins deleted: {count}.",
  "sidebar.filtersSorting": "Filters and Sorting",
  "sidebar.configuration": "Configuration",
  "action.add": "Add",
  "action.save": "Save",
  "action.cancel": "Cancel",
  "action.sync": "Synchronize",
  "action.downloadCovers": "Download covers",
  "action.removeUnofficial": "Clean unofficial imports",
  "coverManager.title": "Coin cover and data",
  "coverManager.dataSection": "Coin data",
  "coverManager.coverSection": "Cover",
  "coverManager.numistaSection": "Numista",
  "coverManager.historySection": "History",
  "coverManager.save": "Save data",
  "coverManager.numistaCover": "Download cover from Numista",
  "coverManager.numistaData": "Update data from Numista",
  "coverManager.disk": "Load cover from disk",
  "coverManager.process": "Process image",
  "coverManager.undo": "Undo change",
  "coverManager.close": "Close",
  "coverManager.background": "Remove background",
  "coverManager.catalog": "Catalog coin",
  "coverManager.noUndo": "There is no saved change to undo.",
  "coverManager.undoDone": "Previous coin data and cover restored.",
  "coverManager.diskDone": "Custom cover loaded.",
  "coverManager.numistaDone": "Numista data updated.",
  "coverManager.numistaCoverDone": "Numista cover downloaded.",
  "filter.search": "Search: country, title, year, mint",
  "filter.countries": "All countries",
  "filter.years": "All years",
  "filter.all": "All",
  "filter.owned": "Owned",
  "filter.missing": "Missing",
  "filter.commemorative": "Commemorative",
  "filter.national": "National",
  "sort.label": "Sort by",
  "sort.yearAsc": "Year: ascending",
  "sort.yearDesc": "Year: descending",
  "sort.countryAsc": "Country: ascending",
  "sort.countryDesc": "Country: descending",
  "coin.edit": "Edit coin",
  "coin.add": "Add coin",
  "coin.country": "Country",
  "coin.year": "Year",
  "coin.title": "Title / design",
  "coin.type": "Type",
  "coin.national": "National",
  "coin.commemorative": "Commemorative",
  "coin.mint": "Mint",
  "coin.owned": "I own this coin",
  "coin.quantity": "Quantity",
  "coin.date": "Acquisition date",
  "coin.price": "Acquisition price",
  "coin.currency": "Currency",
  "coin.condition": "Condition",
  "coin.coverUrl": "Cover / obverse URL",
  "coin.notes": "Notes",
  "coin.referenceYear": "Cover reference year",
  "coin.referenceYearDesc": "Choose a suggested year from another coin with the same country, title and type whose cover is locked, or enter a year manually.",
  "coin.referenceYearPh": "e.g. 2014",
  "coin.coverLocked": "Lock cover",
  "coin.coverLockedDesc": "Do not change or download the cover again during synchronization with Numista.",
  "coin.ownCover": "Custom cover",
  "coin.ownCoverDesc": "The cover was selected or prepared by me. Cover protection remains active.",
  "coin.photoAuthor": "Photo author / copyright",
  "coin.photoLicense": "Photo license",
  "coin.numismaticValue": "Numismatic value",
  "coin.numismaticValueDesc": "Numista estimates by grade; values in EUR.",
  "settings.title": "2 Euro Collection",
  "settings.language": "Interface language",
  "settings.languageDesc": "Language used by the plugin interface",
  "settings.auto": "Automatic",
  "settings.polish": "Polski",
  "settings.english": "English",
  "settings.root": "Root folder",
  "settings.collection": "Collection name",
  "settings.coins": "Coins folder",
  "settings.covers": "Covers folder",
  "settings.columns": "Coins per row",
  "settings.columnsDesc": "Number of cards in one dashboard row (4–10).",
  "settings.apiKey": "Numista API key",
  "settings.structure": "Create / repair structure",
  "settings.execute": "Run",
  "status.owned": "Owned",
  "status.missing": "Missing",
  "summary.owned": "Owned: {owned} / {total}",
  "error.required": "Country, year and title are required.",
  "notice.saved": "Coin saved.",
  "notice.loaded": "2 Euro Collection 0.5.41 loaded",
  "indicator.missing": "Cover reference year is missing",
  "indicator.exact": "Image matches the coin year",
  "indicator.reference": "Image from reference coin: {country}, {type}, {year}",
  "indicator.notFound": "No reference cover found for year {year}",
  "indicator.ownCover": "Custom cover – cover is protected",
  "image.reference": "Reference cover: {year}",
  "preview.close": "Close preview",
  "command.normalizeTitles": "Normalize 2 Euro coin titles",
  "notice.titlesNormalized": "Titles normalized: {updated}; unchanged: {unchanged}; errors: {errors}."
};
function formatText(template,vars={}){return String(template).replace(/\{(\w+)\}/g,(_,k)=>Object.prototype.hasOwnProperty.call(vars,k)?String(vars[k]):`{${k}}`);}
const tx=v=>v==null?'':String(v).trim();
const clean=v=>tx(v).replace(/[\\/:*?"<>|]/g,'').trim();
const isTrue=v=>v===true||String(v).toLowerCase()==='true';
const toNum=v=>{const n=Number(String(v??'').replace(',','.'));return Number.isFinite(n)?n:null};
function normalizeCoinTitle(value){const title=tx(value).replace(/\s+/g,' ').trim();return title.replace(/^2\s*Euros?\.?\b/i,'2 Euro');}
function countryName(v){const x=tx(v),k=x.toLowerCase();const m={'germany, federal republic of':'Germany','germany, federal republic':'Germany','federal republic of germany':'Germany','germany':'Germany','vatican city state':'Vatican','vatican city':'Vatican','vatican city, state of':'Vatican','holy see (vatican city state)':'Vatican','holy see':'Vatican','principality of andorra':'Andorra','principality of monaco':'Monaco','republic of san marino':'San Marino','republic of austria':'Austria','kingdom of belgium':'Belgium','republic of cyprus':'Cyprus','republic of estonia':'Estonia','republic of finland':'Finland','french republic':'France','hellenic republic':'Greece','republic of ireland':'Ireland','italian republic':'Italy','republic of latvia':'Latvia','republic of lithuania':'Lithuania','grand duchy of luxembourg':'Luxembourg','republic of malta':'Malta','kingdom of the netherlands':'Netherlands','portuguese republic':'Portugal','slovak republic':'Slovakia','republic of slovenia':'Slovenia','kingdom of spain':'Spain'};return m[k]||x.replace(/^(Republic of|Kingdom of|Principality of|Grand Duchy of)\s+/i,'');}

class CoinModal extends Modal {
  constructor(app,plugin,row){super(app);this.plugin=plugin;this.row=row||null;if(this.row?.file instanceof TFile)this.plugin.currentCoinFile=this.row.file;}
  onOpen(){const p=this.plugin,t=(k,v)=>p.t(k,v),c=this.contentEl,f=this.row?{...this.row}:{country:'',year:'',title:'',coin_type:'commemorative',mint_mark:'',owned:false,quantity:1,acquisition_date:'',acquisition_price:'',acquisition_currency:'PLN',condition:'',notes:'',cover_url:'',reference_year:'',cover_locked:false,own_cover:false};c.empty();c.createEl('h2',{text:t(this.row?'coin.edit':'coin.add')});
    const input=(key,field,ph='',desc='')=>{const setting=new Setting(c).setName(t(key));if(desc)setting.setDesc(t(desc));setting.addText(x=>x.setValue(tx(f[field])).setPlaceholder(ph? t(ph):'').onChange(v=>f[field]=v));return setting;};
    input('coin.country','country');input('coin.year','year');input('coin.title','title');
    new Setting(c).setName(t('coin.type')).addDropdown(d=>d.addOption('commemorative',t('coin.commemorative')).addOption('national',t('coin.national')).setValue(f.coin_type||'commemorative').onChange(v=>{f.coin_type=v;}));
    input('coin.mint','mint_mark');new Setting(c).setName(t('coin.owned')).addToggle(x=>x.setValue(isTrue(f.owned)).onChange(v=>f.owned=v));input('coin.quantity','quantity');input('coin.date','acquisition_date');input('coin.price','acquisition_price');input('coin.currency','acquisition_currency');input('coin.condition','condition');input('coin.coverUrl','cover_url');
    const referenceSetting=new Setting(c).setName(t('coin.referenceYear')).setDesc(t('coin.referenceYearDesc'));
    const datalistId=`twoeuro-reference-years-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const datalist=c.createEl('datalist',{attr:{id:datalistId}});
    const updateReferenceSuggestions=()=>{
      datalist.empty();
      const years=p.getReferenceYearSuggestions(f,this.row?.file);
      for(const year of years)datalist.createEl('option',{attr:{value:String(year)}});
    };
    referenceSetting.addText(text=>{
      text.setValue(tx(f.reference_year)).setPlaceholder(t('coin.referenceYearPh'));
      text.inputEl.setAttribute('list',datalistId);
      text.inputEl.setAttribute('inputmode','numeric');
      text.inputEl.addEventListener('focus',updateReferenceSuggestions);
      text.onChange(value=>{f.reference_year=value;});
    });
    updateReferenceSuggestions();
    new Setting(c).setName(t('coin.coverLocked')).setDesc(t('coin.coverLockedDesc')).addToggle(x=>x.setValue(isTrue(f.cover_locked)).onChange(v=>f.cover_locked=v));
    new Setting(c).setName(t('coin.ownCover')).setDesc(t('coin.ownCoverDesc')).addToggle(x=>x.setValue(isTrue(f.own_cover)).onChange(v=>{f.own_cover=v;if(v)f.cover_locked=true;}));
    input('coin.photoAuthor','photo_author');input('coin.photoLicense','photo_license');
    new Setting(c).setName(t('coin.numismaticValue')).setDesc(t('coin.numismaticValueDesc')).addTextArea(x=>{x.setValue(p.formatNumismaticValue(f));x.inputEl.readOnly=true;});
    new Setting(c).setName(t('coin.notes')).addTextArea(x=>x.setValue(tx(f.notes)).onChange(v=>f.notes=v));
    const actions=c.createDiv({cls:'twoeuro-actions'});actions.createEl('button',{text:t('action.cancel')}).onclick=()=>this.close();actions.createEl('button',{text:t('action.save'),cls:'mod-cta'}).onclick=async()=>{if(!clean(f.country)||!tx(f.year)||!clean(f.title)){new Notice(t('error.required'));return;}const savedFile=await p.upsert(f,this.row&&this.row.file);p._lastSavedOverride={file:savedFile,data:{...(this.row||{}),...f,file:savedFile,country:countryName(f.country),year:tx(f.year),title:normalizeCoinTitle(f.title),coin_type:f.coin_type||'commemorative',mint_mark:tx(f.mint_mark),owned:isTrue(f.owned),reference_year:tx(f.reference_year),cover_locked:isTrue(f.cover_locked),own_cover:isTrue(f.own_cover)}};await p.refreshDashboards();new Notice(t('notice.saved'));this.close();};
  }
}
class EuroSettings extends PluginSettingTab {
  constructor(app,plugin){super(app,plugin);this.plugin=plugin;}
  display(){const c=this.containerEl,p=this.plugin,t=(k,v)=>p.t(k,v);c.empty();c.createEl('h2',{text:t('settings.title')});
    new Setting(c).setName(t('settings.language')).setDesc(t('settings.languageDesc')).addDropdown(d=>{d.addOption('auto',t('settings.auto'));for(const lang of p.getAvailableLanguages())d.addOption(lang.code,lang.name);d.setValue(p.settings.language||'auto').onChange(async v=>{p.settings.language=v;await p.saveSettings();this.display();});});
    const inp=(key,field,desc='')=>new Setting(c).setName(t(key)).setDesc(desc).addText(x=>x.setValue(p.settings[field]||'').onChange(async v=>{p.settings[field]=v;await p.saveSettings();}));
    inp('settings.root','rootFolder');inp('settings.collection','collectionFolder');inp('settings.coins','coinsFolder');inp('settings.covers','coversFolder');
    new Setting(c).setName(t('settings.columns')).setDesc(t('settings.columnsDesc')).addSlider(sl=>sl.setLimits(4,10,1).setValue(Number(p.settings.columns)||6).setDynamicTooltip().onChange(async v=>{p.settings.columns=v;await p.saveSettings();}));
    new Setting(c).setName(t('settings.apiKey')).addText(x=>{x.inputEl.type='password';x.setValue(p.settings.numistaApiKey||'').onChange(async v=>{p.settings.numistaApiKey=tx(v);await p.saveSettings();});});
    new Setting(c).setName(t('settings.structure')).addButton(b=>b.setButtonText(t('settings.execute')).setCta().onClick(async()=>{await p.ensureDashboard();new Notice(t('settings.structure'));}));
  }
}

class CoinCoverManagerModal extends Modal {
  constructor(app,plugin,row,displaySrc=''){super(app);this.plugin=plugin;this.row=row;this.displaySrc=displaySrc;this.form=null;}
  async onOpen(){
    this.modalEl.addClass('twoeuro-cover-manager-modal');
    await this.render();
  }
  async buildEditableForm(container,fresh){const p=this.plugin,t=(k,v)=>p.t(k,v),f={...fresh};this.form=f;const input=(key,field,ph='',desc='')=>{const item=new Setting(container).setName(t(key));if(desc)item.setDesc(t(desc));item.addText(x=>x.setValue(tx(f[field])).setPlaceholder(ph?t(ph):'').onChange(v=>f[field]=v));};
    input('coin.country','country');input('coin.year','year');input('coin.title','title');new Setting(container).setName(t('coin.type')).addDropdown(d=>d.addOption('commemorative',t('coin.commemorative')).addOption('national',t('coin.national')).setValue(f.coin_type||'commemorative').onChange(v=>f.coin_type=v));input('coin.mint','mint_mark');new Setting(container).setName(t('coin.owned')).addToggle(x=>x.setValue(isTrue(f.owned)).onChange(v=>f.owned=v));input('coin.quantity','quantity');input('coin.date','acquisition_date');input('coin.price','acquisition_price');input('coin.currency','acquisition_currency');input('coin.condition','condition');input('coin.coverUrl','cover_url');
    const ref=new Setting(container).setName(t('coin.referenceYear')).setDesc(t('coin.referenceYearDesc')),listId=`cover-manager-years-${Date.now()}`,list=container.createEl('datalist',{attr:{id:listId}});for(const year of p.getReferenceYearSuggestions(f,fresh.file))list.createEl('option',{attr:{value:String(year)}});ref.addText(x=>{x.setValue(tx(f.reference_year)).setPlaceholder(t('coin.referenceYearPh'));x.inputEl.setAttribute('list',listId);x.onChange(v=>f.reference_year=v);});
    new Setting(container).setName(t('coin.coverLocked')).setDesc(t('coin.coverLockedDesc')).addToggle(x=>x.setValue(isTrue(f.cover_locked)).onChange(v=>f.cover_locked=v));new Setting(container).setName(t('coin.ownCover')).setDesc(t('coin.ownCoverDesc')).addToggle(x=>x.setValue(isTrue(f.own_cover)).onChange(v=>{f.own_cover=v;if(v)f.cover_locked=true;}));new Setting(container).setName(t('coin.notes')).addTextArea(x=>x.setValue(tx(f.notes)).onChange(v=>f.notes=v));input('coin.photoAuthor','photo_author');input('coin.photoLicense','photo_license');new Setting(container).setName(t('coin.numismaticValue')).setDesc(t('coin.numismaticValueDesc')).addTextArea(x=>{x.setValue(p.formatNumismaticValue(f));x.inputEl.readOnly=true;});
  }
  async render(){const p=this.plugin,t=(k,v)=>p.t(k,v),c=this.contentEl;c.empty();c.addClass('twoeuro-cover-manager');const fresh=p.getRows().find(r=>r.file.path===this.row.file.path)||this.row;this.row=fresh;c.createEl('h2',{text:t('coverManager.title')});const layout=c.createDiv({cls:'twoeuro-cover-manager-layout'}),left=layout.createDiv({cls:'twoeuro-cover-manager-left'}),right=layout.createDiv({cls:'twoeuro-cover-manager-data'}),preview=left.createDiv({cls:'twoeuro-cover-manager-preview'}),resolved=p.resolveDisplayCover(fresh,p.buildReferenceCoverIndex(p.getRows())),src=p.coverSrc(fresh)||resolved.src||this.displaySrc;if(src)preview.createEl('img',{attr:{src,alt:fresh.title||''}});else preview.createDiv({cls:'twoeuro-placeholder',text:'2 €'});
    right.createEl('h3',{cls:'twoeuro-cover-manager-section',text:t('coverManager.dataSection')});await this.buildEditableForm(right,fresh);const saveRow=async()=>{if(!clean(this.form.country)||!tx(this.form.year)||!clean(this.form.title))throw new Error(t('error.required'));await p.snapshotCoinState(fresh);const saved=await p.upsert(this.form,fresh.file);p._lastSavedOverride={file:saved,data:{...fresh,...this.form,file:saved,country:countryName(this.form.country),year:tx(this.form.year),title:normalizeCoinTitle(this.form.title),coin_type:this.form.coin_type||'commemorative',mint_mark:tx(this.form.mint_mark),owned:isTrue(this.form.owned),reference_year:tx(this.form.reference_year),cover_locked:isTrue(this.form.cover_locked),own_cover:isTrue(this.form.own_cover)}};await p.refreshDashboards();};
    const run=async fn=>{try{await fn();await p.refreshDashboards();p.refreshFilterViews();await new Promise(resolve=>setTimeout(resolve,120));const freshAfter=await p.readCoinRowFresh(this.row.file);if(freshAfter)this.row=freshAfter;await this.render();}catch(error){console.error('Coin cover manager',error);new Notice(error?.message||String(error));}};
    const saveActions=right.createDiv({cls:'twoeuro-cover-manager-save'});saveActions.createEl('button',{text:t('coverManager.save'),cls:'mod-cta'}).onclick=async()=>{try{await saveRow();await p.refreshDashboards();p.refreshFilterViews();new Notice(t('notice.saved'));this.close();}catch(error){console.error('Coin cover manager save',error);new Notice(error?.message||String(error));}};
    left.createEl('h3',{cls:'twoeuro-cover-manager-section',text:t('coverManager.coverSection')});const coverActions=left.createDiv({cls:'twoeuro-cover-manager-action-group'});coverActions.createEl('button',{text:t('coverManager.background')}).onclick=()=>run(async()=>{await p.snapshotCoinState(fresh);await p.processBackgroundForRow(fresh);});coverActions.createEl('button',{text:t('coverManager.catalog')}).onclick=()=>run(async()=>{await p.snapshotCoinState(fresh);await p.processCatalogPresetForRow(fresh);});
    const fileInput=c.createEl('input',{attr:{type:'file',accept:'image/*'}});fileInput.addClass('twoeuro-cover-manager-file');fileInput.onchange=()=>run(async()=>{const file=fileInput.files?.[0];if(!file)return;await p.snapshotCoinState(fresh);await p.loadCustomCoverFromDisk(fresh,file);new Notice(t('coverManager.diskDone'));});coverActions.createEl('button',{text:t('coverManager.disk')}).onclick=()=>fileInput.click();
    left.createEl('h3',{cls:'twoeuro-cover-manager-section',text:t('coverManager.numistaSection')});const numista=left.createDiv({cls:'twoeuro-cover-manager-action-group'});numista.createEl('button',{text:t('coverManager.numistaCover')}).onclick=()=>run(async()=>{await p.snapshotCoinState(fresh);await p.downloadNumistaCoverForCoin(fresh);new Notice(t('coverManager.numistaCoverDone'));});numista.createEl('button',{text:t('coverManager.numistaData')}).onclick=()=>run(async()=>{await p.snapshotCoinState(fresh);await p.updateSingleCoinFromNumista(fresh);new Notice(t('coverManager.numistaDone'));});
    left.createEl('h3',{cls:'twoeuro-cover-manager-section',text:t('coverManager.historySection')});const history=left.createDiv({cls:'twoeuro-cover-manager-action-group'});history.createEl('button',{text:t('coverManager.undo')}).onclick=()=>run(async()=>{const ok=await p.undoCoinChange(fresh);new Notice(ok?t('coverManager.undoDone'):t('coverManager.noUndo'));});history.createEl('button',{text:t('coverManager.close')}).onclick=()=>this.close();
  }
  async onClose(){await this.plugin.refreshDashboards();this.plugin.refreshFilterViews();this.contentEl.empty();}
}

class EuroFiltersView extends ItemView {
  constructor(leaf,plugin){super(leaf);this.plugin=plugin;}
  getViewType(){return VIEW_TYPE_FILTERS;}
  getDisplayText(){return this.plugin.t('sidebar.title');}
  getIcon(){return 'sliders-horizontal';}
  async onOpen(){this.render();}
  render(){const p=this.plugin,t=(k,v)=>p.t(k,v),c=this.contentEl;c.empty();c.addClass('twoeuro-sidebar');c.createEl('h3',{cls:'twoeuro-sidebar-section-title',text:t('sidebar.actions')});
    const actions=c.createDiv({cls:'twoeuro-sidebar-actions'});
    actions.createEl('button',{text:`+ ${t('action.add')}`,cls:'mod-cta'}).onclick=()=>new CoinModal(this.app,p).open();
    actions.createEl('button',{text:t('action.sync')}).onclick=()=>p.syncNumista();
    actions.createEl('button',{text:t('action.downloadCovers')}).onclick=()=>p.backfillCovers();
    const selectedCount=p.getSelectedCoinFiles().length;
    c.createDiv({cls:'twoeuro-sidebar-selected',text:t('sidebar.selected',{count:selectedCount})});
    const batch=c.createDiv({cls:'twoeuro-sidebar-batch-actions'});
    const imageAction=c.createDiv({cls:'twoeuro-sidebar-image-action'});
    imageAction.createDiv({cls:'twoeuro-sidebar-label',text:t('action.imagePreset')});
    const imagePreset=imageAction.createEl('select',{cls:'twoeuro-sidebar-select'});imagePreset.createEl('option',{text:t('action.catalogPresetSelected'),attr:{value:'catalog'}});imagePreset.createEl('option',{text:t('action.removeBackgroundSelected'),attr:{value:'background'}});
    const processBtn=imageAction.createEl('button',{text:t('action.processImage'),cls:'twoeuro-sidebar-process'});processBtn.disabled=selectedCount===0;processBtn.onclick=()=>p.processSelectedImages(imagePreset.value);
    const duplicateBtn=batch.createEl('button',{text:t('action.duplicateSelected')});duplicateBtn.disabled=selectedCount===0;duplicateBtn.onclick=()=>p.duplicateSelectedCoins();
    const deleteBtn=batch.createEl('button',{text:t('action.deleteSelected')});deleteBtn.disabled=selectedCount===0;deleteBtn.onclick=()=>p.deleteSelectedCoins();
    const clearBtn=c.createEl('button',{text:t('sidebar.clearSelection'),cls:'twoeuro-sidebar-clear'});clearBtn.disabled=selectedCount===0;clearBtn.onclick=()=>{p.clearCoinSelection();p.refreshDashboards();p.refreshFilterViews();};
    c.createEl('hr');c.createEl('h3',{cls:'twoeuro-sidebar-section-title',text:t('sidebar.filtersSorting')});
    const rows=p.getRows(),state=p.getDashboardState();
    c.createDiv({cls:'twoeuro-sidebar-label',text:t('filter.search')});
    const search=c.createEl('input',{cls:'twoeuro-sidebar-search',attr:{type:'search',placeholder:t('filter.search')}});search.value=state.searchText||'';
    c.createDiv({cls:'twoeuro-sidebar-label',text:t('coin.country')});const country=c.createEl('select',{cls:'twoeuro-sidebar-select'});country.createEl('option',{text:t('filter.countries'),attr:{value:''}});[...new Set(rows.map(r=>r.country).filter(Boolean))].sort((a,b)=>a.localeCompare(b,p.getLanguage())).forEach(v=>country.createEl('option',{text:v,attr:{value:v}}));country.value=state.country||'';
    c.createDiv({cls:'twoeuro-sidebar-label',text:t('coin.year')});const year=c.createEl('select',{cls:'twoeuro-sidebar-select'});year.createEl('option',{text:t('filter.years'),attr:{value:''}});[...new Set(rows.map(r=>r.year).filter(Boolean))].sort((a,b)=>Number(b)-Number(a)).forEach(v=>year.createEl('option',{text:v,attr:{value:v}}));year.value=state.year||'';
    c.createDiv({cls:'twoeuro-sidebar-label',text:t('coin.type')});const mode=c.createEl('select',{cls:'twoeuro-sidebar-select'});[['all','filter.all'],['owned','filter.owned'],['missing','filter.missing'],['commemorative','filter.commemorative'],['national','filter.national']].forEach(([v,k])=>mode.createEl('option',{text:t(k),attr:{value:v}}));mode.value=state.mode||'all';
    c.createDiv({cls:'twoeuro-sidebar-label',text:t('sort.label')});const sort=c.createEl('select',{cls:'twoeuro-sidebar-select'});[['yearAsc','sort.yearAsc'],['yearDesc','sort.yearDesc'],['countryAsc','sort.countryAsc'],['countryDesc','sort.countryDesc']].forEach(([v,k])=>sort.createEl('option',{text:t(k),attr:{value:v}}));sort.value=state.sortMode||'yearAsc';
    c.createEl('hr');c.createEl('h3',{cls:'twoeuro-sidebar-section-title',text:t('sidebar.configuration')});
    c.createDiv({cls:'twoeuro-sidebar-label',text:t('settings.columns')});const columnsWrap=c.createDiv({cls:'twoeuro-sidebar-slider-row'});const columns=columnsWrap.createEl('input',{attr:{type:'range',min:'4',max:'10',step:'1',value:String(Number(p.settings.columns)||6)}});const columnsValue=columnsWrap.createSpan({cls:'twoeuro-sidebar-slider-value',text:String(Number(p.settings.columns)||6)});
    c.createDiv({cls:'twoeuro-sidebar-label',text:t('settings.language')});const language=c.createEl('select',{cls:'twoeuro-sidebar-select'});language.createEl('option',{text:t('settings.auto'),attr:{value:'auto'}});for(const lang of p.getAvailableLanguages())language.createEl('option',{text:lang.name,attr:{value:lang.code}});language.value=p.settings.language||'auto';
    const apply=()=>{p.setDashboardState({mode:mode.value,country:country.value,year:year.value,searchText:search.value,sortMode:sort.value});p.refreshDashboards();};
    search.oninput=apply;country.onchange=apply;year.onchange=apply;mode.onchange=apply;sort.onchange=apply;
    columns.oninput=()=>{columnsValue.setText(String(Math.min(10,Math.max(4,Number(columns.value)||6))));};
    columns.onchange=async()=>{const value=Math.min(10,Math.max(4,Number(columns.value)||6));columnsValue.setText(String(value));p.settings.columns=value;await p.saveSettings();await p.refreshDashboards();};
    language.onchange=async()=>{p.settings.language=language.value;await p.saveSettings();await p.refreshDashboards();p.refreshFilterViews();};
  }
}

module.exports = class TwoEuroCollectionPlugin extends Plugin {
  async onload(){console.log(`2 Euro Collection ${this.manifest.version} starting`);await this.loadSettings();await this.loadExternalLanguages();this.dashboardState={mode:'all',country:'',year:'',searchText:'',sortMode:'yearAsc'};this.selectedCoinPaths=new Set();this.registerView(VIEW_TYPE_FILTERS,leaf=>new EuroFiltersView(leaf,this));this.addCommand({id:'two-euro-open-filters',name:this.t('sidebar.open'),callback:()=>this.activateFiltersView()});this.addRibbonIcon('circle-dollar-sign','2 Euro Collection',()=>this.openDashboard());this.addCommand({id:'two-euro-open',name:this.t('command.open'),callback:()=>this.openDashboard()});this.addCommand({id:'two-euro-add',name:this.t('command.add'),callback:()=>new CoinModal(this.app,this).open()});this.addCommand({id:'two-euro-sync',name:this.t('command.sync'),callback:()=>this.syncNumista()});this.addCommand({id:'two-euro-covers',name:this.t('command.covers'),callback:()=>this.backfillCovers()});this.addCommand({id:'two-euro-remove-current-background',name:this.t('command.removeCurrentBackground'),callback:()=>this.removeBackgroundFromCurrentCoin()});this.addCommand({id:'two-euro-catalog-preset-current',name:this.t('command.catalogPresetCurrent'),callback:()=>this.applyCatalogPresetToCurrentCoin()});this.addCommand({id:'two-euro-dedupe',name:this.t('command.dedupe'),callback:async()=>new Notice(`Usunięto duplikatów: ${await this.dedupe()}`)});
  this.addCommand({id:'two-euro-init-reference-fields',name:this.t('command.initFields'),callback:async()=>{const result=await this.initializeReferenceFields();new Notice(`Uzupełniono pola: ${result.updated}; bez zmian: ${result.unchanged}.`);}});
  this.addCommand({
    id: 'two-euro-migrate-covers',
    name: '2 Euro Collection: Napraw ścieżki okładek',
    callback: async () => {
      const fixed = await this.migrateCoverLinks();
      new Notice(`Naprawiono ${fixed} okładek.`);
    }
    }); 
  this.addCommand({id:'two-euro-normalize-folders',name:this.t('command.normalizeFolders'),callback:async()=>new Notice(`Przeniesiono plików: ${await this.normalizeCountryFolders()}`)});this.addCommand({id:'two-euro-normalize-protected-covers',name:this.t('command.normalizeProtectedCovers'),callback:()=>this.normalizeProtectedCoverNames()});this.addCommand({id:'two-euro-normalize-titles',name:this.t('command.normalizeTitles'),callback:()=>this.normalizeExistingTitles()});this.addCommand({id:'two-euro-remove-unofficial',name:this.t('command.removeUnofficial'),callback:()=>this.removeUnofficialImports()});this.registerMarkdownCodeBlockProcessor('two-euro-collection',async(_src,el)=>{try{await this.renderDashboard(el);}catch(e){console.error('2 Euro dashboard',e);el.empty();el.createEl('pre',{text:`2 Euro Collection: ${e.message||e}`});}});this.addSettingTab(new EuroSettings(this.app,this));console.log(`2 Euro Collection ${this.manifest.version} loaded`);new Notice(this.t('notice.loaded',{version:this.manifest.version}));}
  async loadSettings(){this.settings=Object.assign({},DEFAULTS,await this.loadData());}
  languagesFolder(){return normalizePath(`${this.manifest.dir}/Languages`);}
  async loadExternalLanguages(){this.externalLanguages={};this.availableLanguages=[{code:'en',name:'English'}];const folder=this.languagesFolder();try{if(!(await this.app.vault.adapter.exists(folder)))return;const listing=await this.app.vault.adapter.list(folder);for(const path of listing.files.filter(file=>file.toLowerCase().endsWith('.json'))){try{const parsed=JSON.parse(await this.app.vault.adapter.read(path)),code=tx(parsed.code||path.split('/').pop().replace(/\.json$/i,'')).toLowerCase(),name=tx(parsed.name)||code,strings=parsed.strings&&typeof parsed.strings==='object'?parsed.strings:{};if(!code||code==='en')continue;this.externalLanguages[code]=strings;this.availableLanguages.push({code,name});}catch(error){console.warn('Invalid language file',path,error);}}this.availableLanguages.sort((a,b)=>a.code==='en'?-1:b.code==='en'?1:a.name.localeCompare(b.name));}catch(error){console.warn('Languages folder unavailable',error);}}
  getAvailableLanguages(){return this.availableLanguages||[{code:'en',name:'English'}];}
  getLanguage(){const selected=tx(this.settings?.language||'auto').toLowerCase();if(selected!=='auto'&&(selected==='en'||this.externalLanguages?.[selected]))return selected;const locale=String(this.app?.locale||window?.localStorage?.getItem('language')||window?.navigator?.language||'en').toLowerCase().split('-')[0];return this.externalLanguages?.[locale]?locale:'en';}
  t(key,vars={}){const lang=this.getLanguage(),strings=lang==='en'?BASE_LANGUAGE:(this.externalLanguages?.[lang]||{});return formatText(strings[key]??BASE_LANGUAGE[key]??key,vars);}
  async saveSettings(){await this.saveData(this.settings);}
  join(...a){return normalizePath(a.map(tx).map(x=>x.replace(/^\/+|\/+$/g,'')).filter(Boolean).join('/'));}root(){return this.join(this.settings.rootFolder,this.settings.collectionFolder);}coins(){return this.join(this.root(),this.settings.coinsFolder);}covers(){return this.join(this.root(),this.settings.coversFolder);}dashboard(){return this.join(this.root(),'🪙 Kolekcja 2 Euro.md');}
  isSupportedImage(path){
  const ext = (path || '')
    .split('.')
    .pop()
    .toLowerCase();
  return [
    'png',
    'jpg',
    'jpeg',
    'webp',
    'gif',
    'svg'
  ].includes(ext);}
  async ensureFolder(path){if(!path||await this.app.vault.adapter.exists(path))return;let c='';for(const x of path.split('/')){c=c?`${c}/${x}`:x;if(!(await this.app.vault.adapter.exists(c)))await this.app.vault.createFolder(c);}}
  async ensureStructure(){await this.ensureFolder(this.root());await this.ensureFolder(this.coins());await this.ensureFolder(this.covers());}
  async ensureDashboard(){await this.ensureStructure();const p=this.dashboard();if(!(await this.app.vault.adapter.exists(p)))await this.app.vault.create(p,'# 🪙 Kolekcja 2 Euro\n\n```two-euro-collection\n```\n');return p;}
  async openDashboard(){const p=await this.ensureDashboard(),f=this.app.vault.getAbstractFileByPath(p);if(f instanceof TFile)await this.app.workspace.getLeaf(true).openFile(f);await this.activateFiltersView();}
  async uniquePath(p){if(!(await this.app.vault.adapter.exists(p)))return p;const i=p.lastIndexOf('.');let n=2;while(await this.app.vault.adapter.exists(`${p.slice(0,i)} ${n}${p.slice(i)}`))n++;return `${p.slice(0,i)} ${n}${p.slice(i)}`;}
  notePath(d){return this.join(this.coins(),clean(countryName(d.country)),`${clean(d.year)} - ${clean(d.title)}${d.mint_mark?` - ${clean(d.mint_mark)}`:''}.md`);}
  async upsert(d,file){await this.ensureStructure();const country=countryName(d.country);await this.ensureFolder(this.join(this.coins(),clean(country)));const fm={coin_id:d.coin_id||`coin-${d.numista_id||Date.now()}-${d.numista_issue_id||''}`,denomination:2,currency:'EUR',country,year:tx(d.year),coin_type:d.coin_type||'commemorative',title:normalizeCoinTitle(d.title),mint_mark:tx(d.mint_mark)||undefined,owned:isTrue(d.owned),quantity:Number(d.quantity)||1,acquisition_date:tx(d.acquisition_date)||undefined,acquisition_price:toNum(d.acquisition_price),acquisition_currency:tx(d.acquisition_currency)||'PLN',condition:tx(d.condition)||undefined,notes:tx(d.notes)||undefined,source:d.source||'manual',numista_id:d.numista_id||undefined,numista_issue_id:d.numista_issue_id||undefined,numista_url:tx(d.numista_url)||undefined,mintage:d.mintage??undefined,cover:d.cover_path?`[[${d.cover_path}]]`:tx(d.cover)||undefined,cover_url:tx(d.cover_url)||undefined,reference_year:tx(d.reference_year)||undefined,cover_locked:isTrue(d.cover_locked)||isTrue(d.own_cover),own_cover:isTrue(d.own_cover),official_issue:isTrue(d.official_issue),object_type_id:tx(d.object_type_id)||undefined,object_type_name:tx(d.object_type_name)||undefined,photo_author:tx(d.photo_author)||undefined,photo_author_url:tx(d.photo_author_url)||undefined,photo_license:tx(d.photo_license)||undefined,photo_license_url:tx(d.photo_license_url)||undefined,numismatic_value_currency:tx(d.numismatic_value_currency)||undefined,numismatic_values:Array.isArray(d.numismatic_values)?d.numismatic_values:undefined,numismatic_value_unc:d.numismatic_value_unc??undefined};Object.keys(fm).forEach(k=>(fm[k]===undefined||fm[k]===null||fm[k]==='')&&delete fm[k]);const body=`---\n${stringifyYaml(fm).trimEnd()}\n---\n\n# ${fm.title}\n\n${fm.cover?`!${fm.cover}\n`:''}`;if(file instanceof TFile){await this.app.vault.modify(file,body);return file;}return this.app.vault.create(await this.uniquePath(this.notePath(fm)),body);}
  async normalizeExistingTitles(){
    let updated=0,unchanged=0,errors=0;
    const prefix=`${this.coins().replace(/\/$/,'')}/`,files=this.app.vault.getMarkdownFiles().filter(file=>file.path.startsWith(prefix));
    for(const file of files){try{
      const content=await this.app.vault.read(file),match=content.match(/^---\r?\n([\s\S]*?)\r?\n---/);if(!match){unchanged++;continue;}
      const fm=parseYaml(match[1])||{},rawTitle=tx(fm.title),normalized=normalizeCoinTitle(rawTitle);if(!rawTitle||rawTitle===normalized){unchanged++;continue;}
      fm.title=normalized;let body=content.slice(match[0].length);body=body.replace(/^(\s*#\s+)2\s*Euros?\.?\b/im,`$1${normalized}`);const rewritten=`---\n${stringifyYaml(fm).trimEnd()}\n---${body}`;await this.app.vault.modify(file,rewritten);updated++;
    }catch(error){errors++;console.error('Normalize coin title',file.path,error);}}
    this._lastSavedOverride=null;this._pendingRowOverrides=new Map();await new Promise(resolve=>setTimeout(resolve,120));await this.refreshDashboards();this.refreshFilterViews();new Notice(this.t('notice.titlesNormalized',{updated,unchanged,errors}));return {updated,unchanged,errors};
  }

  getReferenceYearSuggestions(form,currentFile=null){
    const country=countryName(form?.country).toLowerCase();
    const title=tx(form?.title).toLowerCase().replace(/\s+/g,' ');
    const type=tx(form?.coin_type).toLowerCase();
    if(!country||!title||!type)return [];
    const years=new Set();
    for(const row of this.getRows()){
      if(currentFile instanceof TFile&&row.file.path===currentFile.path)continue;
      if(!row.cover_locked)continue;
      if(!this.coverSrc(row))continue;
      if(countryName(row.country).toLowerCase()!==country)continue;
      if(tx(row.title).toLowerCase().replace(/\s+/g,' ')!==title)continue;
      if(tx(row.coin_type).toLowerCase()!==type)continue;
      if(tx(row.year))years.add(String(row.year));
    }
    return [...years].sort((a,b)=>(Number(a)||0)-(Number(b)||0));
  }
  getRows(){
    const pre=`${this.coins().replace(/\/$/,'')}/`;
    return this.app.vault.getMarkdownFiles().filter(f=>f.path.startsWith(pre)).map(file=>{const m=this.app.metadataCache.getFileCache(file)?.frontmatter||{};
    return{
      file,
      country:countryName(m.country),
      year:tx(m.year),
      title:normalizeCoinTitle(tx(m.title)||file.basename),
      coin_type:tx(m.coin_type)||'commemorative',
      mint_mark:tx(m.mint_mark),
      owned:isTrue(m.owned),
      quantity:Number(m.quantity)||0,
      acquisition_date:tx(m.acquisition_date),
      acquisition_price:m.acquisition_price,
      acquisition_currency:tx(m.acquisition_currency),
      condition:tx(m.condition),
      notes:tx(m.notes),
      source:tx(m.source),
      numista_id:tx(m.numista_id),
      numista_issue_id:tx(m.numista_issue_id),
      numista_url:tx(m.numista_url),
      mintage:m.mintage,
      cover:tx(m.cover),
      cover_url:tx(m.cover_url),
      reference_year:tx(m.reference_year),
      cover_locked:isTrue(m.cover_locked),
      own_cover:isTrue(m.own_cover),
      official_issue:isTrue(m.official_issue),
      object_type_id:tx(m.object_type_id),
      object_type_name:tx(m.object_type_name),
      photo_author:tx(m.photo_author),photo_author_url:tx(m.photo_author_url),photo_license:tx(m.photo_license),photo_license_url:tx(m.photo_license_url),numismatic_value_currency:tx(m.numismatic_value_currency),numismatic_values:Array.isArray(m.numismatic_values)?m.numismatic_values:[],numismatic_value_unc:m.numismatic_value_unc
    };}).filter(r=>r.country&&r.year);}
  localPath(r){
  const p = tx(r?.cover)
    .replace(/^\[\[/,'')
    .replace(/\]\]$/,'')
    .split('|')[0]
    .trim();
  if (!p) return '';
  // pełna ścieżka
  if (p.includes('/')) {
    return p.replace('/covers/', '/Covers/');
  }
  // sam plik
  return this.join(this.covers(), p);
  }

  coverSrc(r){
  const p = this.localPath(r);
  if (!p || !this.isSupportedImage(p)) {
    return '';
  }
  const file = this.app.vault.getAbstractFileByPath(p);
  return file instanceof TFile
    ? this.app.vault.getResourcePath(file)
    : '';
  }
  async waitForRequestSlot(minIntervalMs=1250){const now=Date.now(),wait=Math.max(0,(this._lastRequestAt||0)+minIntervalMs-now);if(wait>0)await new Promise(r=>setTimeout(r,wait));this._lastRequestAt=Date.now();}
  async requestWithRetry(options,config={}){const minIntervalMs=config.minIntervalMs||1250,maxAttempts=config.maxAttempts||5,label=config.label||'Numista';let lastError;for(let attempt=1;attempt<=maxAttempts;attempt++){await this.waitForRequestSlot(minIntervalMs);try{return await requestUrl(options);}catch(error){lastError=error;const match=String(error?.message||'').match(/status\s+(\d+)/i),status=Number(error?.status||error?.response?.status||(match&&match[1])||0);if(status!==429||attempt===maxAttempts)throw error;const delayMs=Math.min(60000,5000*(2**(attempt-1)))+Math.floor(Math.random()*1000);console.warn(`${label}: HTTP 429; ponowienie po ${delayMs} ms`);await new Promise(r=>setTimeout(r,delayMs));}}throw lastError;}
  async api(path){const r=await this.requestWithRetry({url:`https://api.numista.com/v3${path}`,headers:{'Numista-API-Key':tx(this.settings.numistaApiKey),accept:'application/json'}},{minIntervalMs:1250,maxAttempts:5,label:'Numista API'});if(r.status>=400)throw new Error(`Numista HTTP ${r.status}`);return r.json||JSON.parse(r.text||'{}');}
  extractImage(v){if(!v)return'';if(typeof v==='string')return /^https?:/i.test(v)?v:'';if(Array.isArray(v)){for(const x of v){const u=this.extractImage(x);if(u)return u;}}else if(typeof v==='object'){for(const k of ['picture','image','url','uri','full','large','thumbnail','preview']){const u=this.extractImage(v[k]);if(u)return u;}}return'';}pickImage(d){return this.extractImage(d&&d.obverse)||this.extractImage(d&&d.pictures)||this.extractImage(d&&d.images);}
  isTwoEuro(d){const n=Number(d?.value?.numeric_value),c=tx(d?.value?.currency?.name).toLowerCase(),f=tx(d?.value?.currency?.full_name).toLowerCase();return n===2&&(c==='euro'||f==='euro'||f.startsWith('euro ('));}
  async downloadCover(url,id,issue){if(!/^https?:/i.test(url))return'';await this.ensureFolder(this.covers());const r=await this.requestWithRetry({url,headers:{accept:'image/*,*/*','Numista-API-Key':tx(this.settings.numistaApiKey)}},{minIntervalMs:1800,maxAttempts:5,label:'Numista cover'});if(r.status>=400)throw new Error(`Cover HTTP ${r.status}`);const ct=tx(r.headers?.['content-type']||r.headers?.['Content-Type']).toLowerCase(),ext=ct.includes('png')?'png':ct.includes('webp')?'webp':'jpg',p=this.join(this.covers(),`numista-${clean(id)}-${clean(issue)}.${ext}`);await this.app.vault.adapter.writeBinary(p,new Uint8Array(r.arrayBuffer));return p;}
  async moveFolderContents(source,target){
    if(source===target)return 0;
    const src=this.app.vault.getAbstractFileByPath(source);if(!src)return 0;
    await this.ensureFolder(target);let moved=0;
    const files=this.app.vault.getFiles().filter(f=>f.path.startsWith(`${source}/`));
    for(const f of files){const rel=f.path.slice(source.length+1),dest=this.join(target,rel);const parent=dest.includes('/')?dest.slice(0,dest.lastIndexOf('/')):'';if(parent)await this.ensureFolder(parent);if(await this.app.vault.adapter.exists(dest)){continue;}await this.app.fileManager.renameFile(f,dest);moved++;}
    const left=this.app.vault.getAbstractFileByPath(source);if(left&&left.children&&left.children.length===0)await this.app.vault.delete(left,true);return moved;
  }
  async normalizeCountryFolders(){
    const mappings=[['Germany, Federal Republic of','Germany'],['Germany, Federal Republic','Germany'],['Federal Republic of Germany','Germany'],['Vatican City','Vatican'],['Vatican City State','Vatican'],['Vatican City, State of','Vatican'],['Holy See (Vatican City State)','Vatican']];
    let moved=0;for(const [from,to] of mappings)moved+=await this.moveFolderContents(this.join(this.coins(),from),this.join(this.coins(),to));return moved;
  }
  async initializeReferenceFields(){let updated=0,unchanged=0;for(const row of this.getRows()){let changed=false;await this.app.fileManager.processFrontMatter(row.file,fm=>{if(!Object.prototype.hasOwnProperty.call(fm,'reference_year')){fm.reference_year='';changed=true;}if(!Object.prototype.hasOwnProperty.call(fm,'cover_locked')){fm.cover_locked=false;changed=true;}});if(changed)updated++;else unchanged++;}return {updated,unchanged};}
  photoMetadata(details){
    const side=details?.obverse||{};
    return {photo_author:tx(side.picture_copyright),photo_author_url:tx(side.picture_copyright_url),photo_license:tx(side.picture_license_name),photo_license_url:tx(side.picture_license_url)};
  }
  async issueNumismaticValues(typeId,issueId){
    if(!typeId||!issueId)return {currency:'EUR',values:[],unc:null};
    try{const result=await this.api(`/types/${encodeURIComponent(typeId)}/issues/${encodeURIComponent(issueId)}/prices?currency=EUR&lang=en`),prices=Array.isArray(result?.prices)?result.prices:[],values=prices.filter(item=>item&&item.price!=null).map(item=>({grade:tx(item.grade),price:Number(item.price)})).filter(item=>Number.isFinite(item.price));const unc=values.find(item=>item.grade.toLowerCase()==='unc')?.price??null;return {currency:tx(result?.currency)||'EUR',values,unc};}catch(error){console.warn('Numista prices unavailable',typeId,issueId,error);return {currency:'EUR',values:[],unc:null};}
  }
  formatNumismaticValue(row){const values=Array.isArray(row?.numismatic_values)?row.numismatic_values:[],currency=tx(row?.numismatic_value_currency)||'EUR';if(!values.length)return '';return values.map(item=>`${String(item.grade||'').toUpperCase()}: ${item.price} ${currency}`).join(' · ');}
  officialEuroIssuers(){return new Set(['Andorra','Austria','Belgium','Bulgaria','Croatia','Cyprus','Estonia','Finland','France','Germany','Greece','Ireland','Italy','Latvia','Lithuania','Luxembourg','Malta','Monaco','Netherlands','Portugal','San Marino','Slovakia','Slovenia','Spain','Vatican']);}
  isOfficialTwoEuroType(details){
    if(!this.isTwoEuro(details))return false;
    const issuer=countryName(details?.issuer?.name),objectId=Number(details?.object_type?.id||0),objectName=tx(details?.object_type?.name).toLowerCase();
    const officialObject=objectId===1||objectId===2||objectName==='standard circulation coins'||objectName==='circulating commemorative coins';
    if(!officialObject||!this.officialEuroIssuers().has(issuer))return false;
    const haystack=[details?.title,details?.object_type?.name,details?.issuer?.name].map(tx).join(' ').toLowerCase();
    return !/(medal|medallion|token|jeton|pattern|trial|probe|proba|essai|fantasy|fantaisie|private issue|souvenir|replica|copy)/i.test(haystack);
  }
  async removeUnofficialImports(){
    if(!window.confirm(this.t('confirm.removeUnofficial')))return;
    const rows=this.getRows().filter(row=>row.source==='numista'),cache=new Map();let removed=0,protectedCount=0,errors=0;
    const notice=new Notice('Weryfikacja oficjalnych emisji...',0);
    for(let i=0;i<rows.length;i++){const row=rows[i];notice.setMessage(`Weryfikacja oficjalnych emisji: ${i+1} / ${rows.length}`);try{
      if(row.owned||row.cover_locked||row.own_cover){protectedCount++;continue;}
      let official=row.official_issue;
      if(!official&&row.numista_id){let details=cache.get(row.numista_id);if(!details){details=await this.api(`/types/${encodeURIComponent(row.numista_id)}?lang=en`);cache.set(row.numista_id,details);}official=this.isOfficialTwoEuroType(details);}
      if(!official){await this.app.vault.delete(row.file);removed++;}
    }catch(error){errors++;console.error('Remove unofficial import',row.file?.path,error);}}
    await this.refreshDashboards();this.refreshFilterViews();notice.setMessage(this.t('notice.removeUnofficial',{removed,protected:protectedCount,errors}));setTimeout(()=>notice.hide(),8000);
  }
  async syncNumista(){if(!tx(this.settings.numistaApiKey)){new Notice('Uzupełnij klucz API Numista.');return;}const progress=new Notice(this.t('notice.syncOfficial'),0),current=this.getRows(),by=new Map(current.map(r=>[[r.numista_id,r.year,r.mint_mark].join(':'),r])),detailsCache=new Map(),issuesCache=new Map();let page=1,created=0,updated=0,unchanged=0,skipped=0,errors=0,processed=0;try{while(page<=20){const q=new URLSearchParams({q:'2 Euros',object_type:'147',page:String(page),count:'100',lang:'en'}),listing=await this.api(`/types?${q}`),types=listing.types||[];if(!types.length)break;for(const basic of types){processed++;progress.setMessage(`Synchronizacja katalogu: typ ${processed}`);try{const id=tx(basic.id);if(!id){skipped++;continue;}let d=detailsCache.get(id);if(!d){d=await this.api(`/types/${encodeURIComponent(id)}?lang=en`);detailsCache.set(id,d);}if(!this.isOfficialTwoEuroType(d)){skipped++;continue;}let raw=issuesCache.get(id);if(!raw){raw=await this.api(`/types/${encodeURIComponent(id)}/issues?lang=en`);issuesCache.set(id,raw);}const issues=Array.isArray(raw)?raw:(raw.issues||[]),uniq=new Map();for(const i of issues){const year=tx(i.gregorian_year||i.year),mint=tx(i.mint_letter);if(!Number(year))continue;const key=`${year}|${mint}`,prev=uniq.get(key);if(!prev||Number(i.mintage||0)>Number(prev.mintage||0))uniq.set(key,i);}const kind=tx(d.object_type?.name).toLowerCase(),coinType=kind.includes('commemorative')||tx(d.commemorated_topic)?'commemorative':'national',sourceImage=this.pickImage(d);for(const issueRow of uniq.values()){const issue=tx(issueRow.id),year=tx(issueRow.gregorian_year||issueRow.year),mint=tx(issueRow.mint_letter),old=by.get([id,year,mint].join(':'));const photoMeta=this.photoMetadata(d),valuation=await this.issueNumismaticValues(id,issue);const data={...(old||{}),country:countryName(d.issuer?.name),year,title:normalizeCoinTitle(d.title),coin_type:coinType,mint_mark:mint,source:'numista',numista_id:id,numista_issue_id:issue,numista_url:tx(d.url),mintage:issueRow.mintage??null,official_issue:true,object_type_id:tx(d.object_type?.id),object_type_name:tx(d.object_type?.name),...photoMeta,numismatic_value_currency:valuation.currency,numismatic_values:valuation.values,numismatic_value_unc:valuation.unc,cover:old?.cover,cover_url:old?.cover_locked?old?.cover_url:(sourceImage||old?.cover_url),reference_year:old?.reference_year,cover_locked:old?.cover_locked||old?.own_cover||false,own_cover:old?.own_cover||false};if(old){const before=JSON.stringify([old.country,old.title,old.coin_type,old.numista_url,old.mintage,old.cover_url,old.reference_year,old.cover_locked,old.photo_author,old.photo_license,old.numismatic_value_currency,old.numismatic_values,old.numismatic_value_unc]),after=JSON.stringify([data.country,data.title,data.coin_type,data.numista_url,data.mintage,data.cover_url,data.reference_year,data.cover_locked,data.photo_author,data.photo_license,data.numismatic_value_currency,data.numismatic_values,data.numismatic_value_unc]);if(before===after){unchanged++;continue;}await this.upsert(data,old.file);updated++;}else{await this.upsert(data,null);created++;}by.set([id,year,mint].join(':'),{...data,file:old?.file});}}catch(error){errors++;console.error('Synchronizacja typu Numista',basic?.id,error);}}if(types.length<100)break;page++;}progress.setMessage(`Katalog: nowe ${created}, zaktualizowane ${updated}, bez zmian ${unchanged}, pominięte ${skipped}, błędy ${errors}.`);setTimeout(()=>progress.hide(),8000);}catch(error){progress.setMessage(`Synchronizacja katalogu przerwana: ${error?.message||error}`);console.error(error);}}
  async backfillCovers(){if(!tx(this.settings.numistaApiKey)){new Notice('Uzupełnij klucz API Numista.');return;}const candidates=this.getRows().filter(r=>r.source==='numista'&&!r.cover_locked&&!this.coverSrc(r)),progress=new Notice(`Okładki: 0 / ${candidates.length}`,0),cache=new Map();let downloaded=0,skipped=0,errors=0,index=0;for(const r of candidates){index++;progress.setMessage(`Okładki: ${index} / ${candidates.length} · pobrano ${downloaded} · błędy ${errors}`);try{let d=cache.get(r.numista_id);if(!d){d=await this.api(`/types/${encodeURIComponent(r.numista_id)}?lang=en`);cache.set(r.numista_id,d);}const url=this.pickImage(d)||r.cover_url;if(!url){skipped++;continue;}const path=await this.downloadCover(url,r.numista_id,r.numista_issue_id);await this.upsert({...r,cover_path:path,cover_url:url,cover_locked:false},r.file);downloaded++;}catch(error){errors++;console.error('Pobieranie okładki',r.file?.path,error);}}progress.setMessage(`Okładki: pobrano ${downloaded}, pominięto ${skipped}, zablokowane pominięte, błędy ${errors}.`);setTimeout(()=>progress.hide(),8000);return {downloaded,skipped,errors};}
  async dedupe(){const g=new Map();for(const r of this.getRows()){const k=[r.country,r.year,r.title,r.mint_mark].map(x=>tx(x).toLowerCase()).join('|');if(!g.has(k))g.set(k,[]);g.get(k).push(r);}let n=0;for(const a of g.values()){if(a.length<2)continue;const keep=a.find(x=>x.owned)||a[0];for(const r of a)if(r!==keep&&!r.owned&&r.file instanceof TFile){await this.app.vault.delete(r.file);n++;}}return n;}
  async migrateCoverLinks() {
  let updated = 0;
  for (const row of this.getRows()) {
    const cover = tx(row.cover);
    if (!cover) continue;
    const parsed = cover
      .replace(/^\[\[/, '')
      .replace(/\]\]$/, '')
      .split('|')[0];
    // tylko stare wpisy bez ścieżki
    if (!parsed.includes('/')) {
      const newPath = this.join(
        this.covers(),
        parsed
      );
      await this.upsert({
        ...row,
        cover_path: newPath
      }, row.file);
      updated++;
    }
  }
  return updated;
  }
  getSelectedCoinFiles(){const selected=this.selectedCoinPaths||new Set();return this.getRows().filter(row=>selected.has(row.file.path));}
  toggleCoinSelection(path,selected){if(!this.selectedCoinPaths)this.selectedCoinPaths=new Set();if(selected)this.selectedCoinPaths.add(path);else this.selectedCoinPaths.delete(path);this.refreshFilterViews();}
  clearCoinSelection(){if(!this.selectedCoinPaths)this.selectedCoinPaths=new Set();else this.selectedCoinPaths.clear();}
  coverFileStem(row){
    const parts=[countryName(row.country),tx(row.year),tx(row.coin_type)==='national'?'National':'Comm'];
    if(tx(row.coin_type)==='commemorative'&&tx(row.title)){const extra=tx(row.title).replace(/^2\s*Euros?\s*[-–:]?\s*/i,'').trim();if(extra)parts.push(extra);}
    if(tx(row.mint_mark))parts.push(tx(row.mint_mark));
    return parts.map(part=>clean(part).replace(/\s+/g,'-').replace(/-+/g,'-')).filter(Boolean).join('-');
  }
  async uniqueCoverPath(desired,currentPath=''){
    if(desired===currentPath||!(await this.app.vault.adapter.exists(desired)))return desired;const dot=desired.lastIndexOf('.'),base=dot>=0?desired.slice(0,dot):desired,ext=dot>=0?desired.slice(dot):'';let n=2,candidate=`${base}-${n}${ext}`;while(candidate!==currentPath&&await this.app.vault.adapter.exists(candidate)){n++;candidate=`${base}-${n}${ext}`;}return candidate;
  }
  async normalizeProtectedCoverNames(){
    const rows=this.getRows().filter(row=>row.cover_locked);let renamed=0,skipped=0,errors=0;
    for(const row of rows){try{const oldPath=this.localPath(row);if(!oldPath||!oldPath.toLowerCase().endsWith('.png')){skipped++;continue;}const file=this.app.vault.getAbstractFileByPath(oldPath);if(!(file instanceof TFile)){skipped++;continue;}const desired=await this.uniqueCoverPath(this.join(this.covers(),`${this.coverFileStem(row)}.png`),oldPath);if(desired!==oldPath)await this.app.fileManager.renameFile(file,desired);await this.app.fileManager.processFrontMatter(row.file,fm=>{fm.cover=`[[${desired}]]`;if(fm.own_cover===true)fm.cover_locked=true;});renamed++;}catch(error){errors++;console.error('Normalize protected cover',row.file?.path,error);}}
    await this.refreshDashboards();new Notice(this.t('notice.coverNamesNormalized',{renamed,skipped,errors}));return {renamed,skipped,errors};
  }
  async processBackgroundForRow(row){
    const coinFile=row?.file;if(!(coinFile instanceof TFile))return {ok:false,reason:'no-file'};
    const allRows=this.getRows(),referenceIndex=this.buildReferenceCoverIndex(allRows),resolution=this.resolveDisplayCover(row,referenceIndex);
    let sourceRow=row,sourcePath=this.localPath(row),sourceFile=sourcePath&&this.app.vault.getAbstractFileByPath(sourcePath);
    if(!(sourceFile instanceof TFile)&&resolution?.source){sourceRow=resolution.source;sourcePath=this.localPath(sourceRow);sourceFile=sourcePath&&this.app.vault.getAbstractFileByPath(sourcePath);}
    if(!(sourceFile instanceof TFile))return {ok:false,reason:'no-cover'};
    const binary=await this.app.vault.readBinary(sourceFile),image=await this.loadImageFromArrayBuffer(binary),canvas=this.makeTransparentBackground(image),pngBlob=await this.canvasToPngBlob(canvas);
    const pngPath=await this.uniqueCoverPath(this.join(this.covers(),`${this.coverFileStem(row)}.png`),this.localPath(row));
    await this.app.vault.adapter.writeBinary(pngPath,new Uint8Array(await pngBlob.arrayBuffer()));
    await this.app.fileManager.processFrontMatter(coinFile,fm=>{fm.cover=`[[${pngPath}]]`;fm.reference_year=tx(row.year);fm.cover_locked=true;});
    return {ok:true,pngPath,usedReference:sourceRow.file?.path!==row.file.path};
  }

  async removeBackgroundFromSelectedCoins(){const rows=this.getSelectedCoinFiles();if(!rows.length){new Notice(this.t('notice.noSelection'));return;}let done=0,skipped=0,errors=0;for(const row of rows){try{const result=await this.processBackgroundForRow(row);if(result.ok)done++;else{skipped++;console.warn('Batch background skipped',row.file?.path,result.reason);}}catch(error){errors++;console.error('Batch background removal',row.file?.path,error);}}this._lastSavedOverride=null;await new Promise(resolve=>setTimeout(resolve,50));await this.refreshDashboards();this.refreshFilterViews();new Notice(this.t('notice.batchBackground',{done,skipped,errors}));}
  async duplicateSelectedCoins(){const rows=this.getSelectedCoinFiles();if(!rows.length){new Notice(this.t('notice.noSelection'));return;}let count=0;const newSelection=new Set();for(const row of rows){try{const source=await this.app.vault.read(row.file),target=await this.uniquePath(row.file.path),duplicate=await this.app.vault.create(target,source);await this.app.fileManager.processFrontMatter(duplicate,fm=>{fm.coin_id=`duplicate-${Date.now()}-${count+1}`;fm.source='manual';delete fm.numista_id;delete fm.numista_issue_id;delete fm.numista_url;});newSelection.add(duplicate.path);count++;}catch(error){console.error('Duplicate coin',row.file?.path,error);}}this.selectedCoinPaths=newSelection;await this.refreshDashboards();this.refreshFilterViews();new Notice(this.t('notice.batchDuplicate',{count}));}
  async deleteSelectedCoins(){const rows=this.getSelectedCoinFiles();if(!rows.length){new Notice(this.t('notice.noSelection'));return;}if(!window.confirm(this.t('confirm.deleteSelected',{count:rows.length})))return;let count=0;for(const row of rows){try{await this.app.vault.delete(row.file);count++;}catch(error){console.error('Delete coin',row.file?.path,error);}}this.clearCoinSelection();await this.refreshDashboards();this.refreshFilterViews();new Notice(this.t('notice.batchDelete',{count}));}
  getDashboardState(){return {...(this.dashboardState||{mode:'all',country:'',year:'',searchText:'',sortMode:'yearAsc'})};}
  setDashboardState(next){this.dashboardState={...this.getDashboardState(),...next};}
  async activateFiltersView(){let leaf=this.app.workspace.getLeavesOfType(VIEW_TYPE_FILTERS)[0];if(!leaf){leaf=this.app.workspace.getRightLeaf(false);await leaf.setViewState({type:VIEW_TYPE_FILTERS,active:true});}this.app.workspace.revealLeaf(leaf);if(leaf.view instanceof EuroFiltersView)leaf.view.render();}
  refreshFilterViews(){for(const leaf of this.app.workspace.getLeavesOfType(VIEW_TYPE_FILTERS)){if(leaf.view instanceof EuroFiltersView)leaf.view.render();}}
  async refreshDashboards(){
    const dashboards=Array.from(document.querySelectorAll('.twoeuro-view'));
    for(const dashboard of dashboards){
      try{
        const state=this.getDashboardState();
        const replacement=document.createElement('div');
        await this.renderDashboard(replacement,state);
        replacement.className=dashboard.className;
        replacement.style.setProperty('--twoeuro-columns',String(Math.min(10,Math.max(4,Number(this.settings.columns)||6))));
        replacement._twoEuroState=replacement._twoEuroState||state;
        dashboard.replaceWith(replacement);window.setTimeout(()=>{this._lastSavedOverride=null;},1500);this.refreshFilterViews();
      }catch(error){console.error('2 Euro dashboard refresh',error);}
    }
  }
  getCurrentCoinFile(){
    if(this.currentCoinFile instanceof TFile)return this.currentCoinFile;
    const active=this.app.workspace.getActiveFile();
    const prefix=`${this.coins().replace(/\/$/,'')}/`;
    return active instanceof TFile&&active.path.startsWith(prefix)?active:null;
  }
  async loadImageFromArrayBuffer(arrayBuffer){
    const blob=new Blob([arrayBuffer]);
    const objectUrl=URL.createObjectURL(blob);
    try{return await new Promise((resolve,reject)=>{const image=new Image();image.onload=()=>resolve(image);image.onerror=()=>reject(new Error('Image decode failed'));image.src=objectUrl;});}
    finally{URL.revokeObjectURL(objectUrl);}
  }
  makeTransparentBackground(image){
    const canvas=document.createElement('canvas');canvas.width=image.naturalWidth||image.width;canvas.height=image.naturalHeight||image.height;
    const context=canvas.getContext('2d',{willReadFrequently:true});if(!context)throw new Error('Canvas context unavailable');context.drawImage(image,0,0);
    const frame=context.getImageData(0,0,canvas.width,canvas.height),pixels=frame.data,width=canvas.width,height=canvas.height,total=width*height,seen=new Uint8Array(total),queue=new Int32Array(total);let head=0,tail=0;
    const distanceFromWhite=index=>{const offset=index*4;return Math.max(255-pixels[offset],255-pixels[offset+1],255-pixels[offset+2]);};
    const isBackground=index=>{const offset=index*4;if(pixels[offset+3]===0)return true;const red=pixels[offset],green=pixels[offset+1],blue=pixels[offset+2],max=Math.max(red,green,blue),min=Math.min(red,green,blue);return distanceFromWhite(index)<=42&&max-min<=28&&min>=198;};
    const push=index=>{if(index<0||index>=total||seen[index]||!isBackground(index))return;seen[index]=1;queue[tail++]=index;};
    for(let x=0;x<width;x++){push(x);push((height-1)*width+x);}for(let y=0;y<height;y++){push(y*width);push(y*width+width-1);}
    while(head<tail){const index=queue[head++],x=index%width,y=(index/width)|0;if(x>0)push(index-1);if(x<width-1)push(index+1);if(y>0)push(index-width);if(y<height-1)push(index+width);}
    for(let index=0;index<total;index++){if(!seen[index])continue;const offset=index*4,distance=distanceFromWhite(index);pixels[offset+3]=distance<=18?0:Math.max(0,Math.min(255,Math.round((distance-18)/24*255)));}
    context.putImageData(frame,0,0);return canvas;
  }
  makeCatalogCoinCanvas(image){
    const segmented=this.makeTransparentBackground(image),source=segmented.getContext('2d',{willReadFrequently:true}).getImageData(0,0,segmented.width,segmented.height),pixels=source.data,w=segmented.width,h=segmented.height;
    let minX=w,minY=h,maxX=-1,maxY=-1;
    for(let y=0;y<h;y++)for(let x=0;x<w;x++){if(pixels[(y*w+x)*4+3]>40){if(x<minX)minX=x;if(x>maxX)maxX=x;if(y<minY)minY=y;if(y>maxY)maxY=y;}}
    if(maxX<minX||maxY<minY)throw new Error('Coin boundary not detected');
    const bw=maxX-minX+1,bh=maxY-minY+1,margin=.01,cropX=Math.max(0,minX-bw*margin),cropY=Math.max(0,minY-bh*margin),cropW=Math.min(w-cropX,bw*(1+2*margin)),cropH=Math.min(h-cropY,bh*(1+2*margin));
    const size=Math.min(1600,Math.max(768,Math.round(Math.max(cropW,cropH)))),canvas=document.createElement('canvas');canvas.width=size;canvas.height=size;const ctx=canvas.getContext('2d',{willReadFrequently:true});
    ctx.clearRect(0,0,size,size);ctx.save();ctx.beginPath();ctx.arc(size/2,size/2,size/2-2,0,Math.PI*2);ctx.clip();ctx.imageSmoothingEnabled=true;ctx.imageSmoothingQuality='high';ctx.drawImage(segmented,cropX,cropY,cropW,cropH,0,0,size,size);ctx.restore();
    const frame=ctx.getImageData(0,0,size,size),out=frame.data,cx=size/2,cy=size/2,radius=size/2-2,feather=2.5;
    for(let y=0;y<size;y++)for(let x=0;x<size;x++){const i=(y*size+x)*4,dist=Math.hypot(x-cx,y-cy);if(dist>radius){out[i+3]=dist>radius+feather?0:Math.round(255*Math.max(0,(radius+feather-dist)/feather));continue;}if(out[i+3]===0)continue;const lum=.2126*out[i]+.7152*out[i+1]+.0722*out[i+2],contrast=1.04,highlight=lum>145?Math.min(6,(lum-145)/110*6):0;out[i]=Math.max(0,Math.min(255,(out[i]-128)*contrast+128+highlight));out[i+1]=Math.max(0,Math.min(255,(out[i+1]-128)*contrast+128+highlight));out[i+2]=Math.max(0,Math.min(255,(out[i+2]-128)*contrast+128+highlight));}
    ctx.putImageData(frame,0,0);return canvas;
  }
  async processCatalogPresetForRow(row){
    const coinFile=row?.file;if(!(coinFile instanceof TFile))return {ok:false,reason:'no-file'};const allRows=this.getRows(),referenceIndex=this.buildReferenceCoverIndex(allRows),resolution=this.resolveDisplayCover(row,referenceIndex);let sourcePath=this.localPath(row),sourceFile=sourcePath&&this.app.vault.getAbstractFileByPath(sourcePath);if(!(sourceFile instanceof TFile)&&resolution?.source){sourcePath=this.localPath(resolution.source);sourceFile=sourcePath&&this.app.vault.getAbstractFileByPath(sourcePath);}if(!(sourceFile instanceof TFile))return {ok:false,reason:'no-cover'};
    const binary=await this.app.vault.readBinary(sourceFile),image=await this.loadImageFromArrayBuffer(binary),canvas=this.makeCatalogCoinCanvas(image),blob=await this.canvasToPngBlob(canvas),pngPath=await this.uniqueCoverPath(this.join(this.covers(),`${this.coverFileStem(row)}.png`),this.localPath(row));await this.app.vault.adapter.writeBinary(pngPath,new Uint8Array(await blob.arrayBuffer()));await this.app.fileManager.processFrontMatter(coinFile,fm=>{fm.cover=`[[${pngPath}]]`;fm.reference_year=tx(row.year);fm.cover_locked=true;fm.image_preset='catalog-coin';});return {ok:true,pngPath,override:{...row,file:coinFile,cover:`[[${pngPath}]]`,reference_year:tx(row.year),cover_locked:true,own_cover:isTrue(row.own_cover),image_preset:'catalog-coin'}};
  }
  async processSelectedImages(preset){
    if(preset==='background')return this.removeBackgroundFromSelectedCoins();
    return this.applyCatalogPresetToSelectedCoins();
  }
  async applyCatalogPresetToSelectedCoins(){
    const rows=this.getSelectedCoinFiles();if(!rows.length){new Notice(this.t('notice.noSelection'));return;}
    let done=0,skipped=0,errors=0;this._pendingRowOverrides=new Map();
    for(const row of rows){try{const result=await this.processCatalogPresetForRow(row);if(result.ok){done++;this._pendingRowOverrides.set(row.file.path,result.override);}else skipped++;}catch(error){errors++;console.error('Catalog preset',row.file?.path,error);}}
    this._lastSavedOverride=null;await this.refreshDashboards();this.refreshFilterViews();window.setTimeout(()=>{this._pendingRowOverrides=new Map();},1500);new Notice(this.t('notice.batchCatalog',{done,skipped,errors}));
  }

  async applyCatalogPresetToCurrentCoin(){const file=this.getCurrentCoinFile();if(!file){new Notice(this.t('notice.noCurrentCoin'));return;}const row=this.getRows().find(item=>item.file.path===file.path);if(!row){new Notice(this.t('notice.noCurrentCoin'));return;}try{const result=await this.processCatalogPresetForRow(row);if(!result.ok){new Notice(this.t('notice.noCover'));return;}this._pendingRowOverrides=new Map([[row.file.path,result.override]]);await this.refreshDashboards();window.setTimeout(()=>{this._pendingRowOverrides=new Map();},1500);new Notice(this.t('notice.catalogDone'));}catch(error){console.error('Catalog preset',error);new Notice(this.t('notice.backgroundError',{message:error?.message||error}));}}

  canvasToPngBlob(canvas){return new Promise((resolve,reject)=>canvas.toBlob(blob=>blob?resolve(blob):reject(new Error('PNG encoding failed')),'image/png'));}
  async removeBackgroundFromCurrentCoin(){const coinFile=this.getCurrentCoinFile();if(!coinFile){new Notice(this.t('notice.noCurrentCoin'));return;}try{const row=this.getRows().find(item=>item.file.path===coinFile.path);if(!row){new Notice(this.t('notice.noCurrentCoin'));return;}const result=await this.processBackgroundForRow(row);if(!result.ok){new Notice(this.t('notice.noCover'));return;}this._lastSavedOverride={file:coinFile,data:{...row,file:coinFile,reference_year:tx(row.year),cover_locked:true}};await this.refreshDashboards();new Notice(this.t('notice.backgroundRemoved',{year:tx(row.year)}));}catch(error){console.error('2 Euro background removal',error);new Notice(this.t('notice.backgroundError',{message:error?.message||error}));}}

  openCoinImagePreview(row,src){
    if(!src){new CoinModal(this.app,this,row).open();return;}
    const overlay=document.body.createDiv({cls:'twoeuro-preview-overlay'}),dialog=document.body.createDiv({cls:'twoeuro-preview-dialog'});
    const image=dialog.createEl('img',{attr:{src,alt:row.title||''}}),close=dialog.createEl('button',{cls:'twoeuro-preview-close',text:'×',attr:{'aria-label':this.t('preview.close')}});
    const finish=()=>{dialog.remove();overlay.remove();new CoinModal(this.app,this,row).open();};
    overlay.onclick=finish;close.onclick=finish;dialog.onclick=event=>event.stopPropagation();
    const esc=event=>{if(event.key==='Escape'){document.removeEventListener('keydown',esc);finish();}};document.addEventListener('keydown',esc);
  }
  async waitForFreshRow(file,attempts=8){for(let i=0;i<attempts;i++){const row=this.getRows().find(r=>r.file.path===file.path);if(row){await new Promise(resolve=>setTimeout(resolve,40));const again=this.getRows().find(r=>r.file.path===file.path);if(again)return again;}await new Promise(resolve=>setTimeout(resolve,50));}return this.getRows().find(r=>r.file.path===file.path)||null;}
  async readCoinRowFresh(file){
    const content=await this.app.vault.read(file),match=content.match(/^---\r?\n([\s\S]*?)\r?\n---/);let fm={};if(match){try{fm=parseYaml(match[1])||{};}catch{fm={};}}
    const cached=this.getRows().find(row=>row.file.path===file.path)||{file};
    return {...cached,file,country:countryName(fm.country??cached.country),year:tx(fm.year??cached.year),title:normalizeCoinTitle(tx(fm.title??cached.title)||file.basename),coin_type:tx(fm.coin_type??cached.coin_type)||'commemorative',mint_mark:tx(fm.mint_mark??cached.mint_mark),owned:isTrue(fm.owned??cached.owned),quantity:Number(fm.quantity??cached.quantity)||0,acquisition_date:tx(fm.acquisition_date??cached.acquisition_date),acquisition_price:fm.acquisition_price??cached.acquisition_price,acquisition_currency:tx(fm.acquisition_currency??cached.acquisition_currency),condition:tx(fm.condition??cached.condition),notes:tx(fm.notes??cached.notes),cover:tx(fm.cover??cached.cover),cover_url:tx(fm.cover_url??cached.cover_url),reference_year:tx(fm.reference_year??cached.reference_year),cover_locked:isTrue(fm.cover_locked??cached.cover_locked),own_cover:isTrue(fm.own_cover??cached.own_cover),photo_author:tx(fm.photo_author??cached.photo_author),photo_license:tx(fm.photo_license??cached.photo_license),numismatic_value_currency:tx(fm.numismatic_value_currency??cached.numismatic_value_currency),numismatic_values:Array.isArray(fm.numismatic_values)?fm.numismatic_values:(cached.numismatic_values||[]),numismatic_value_unc:fm.numismatic_value_unc??cached.numismatic_value_unc};
  }
  historyFolder(){return this.join(this.root(),'.history');}
  historyKey(row){return clean(row.file.path).replace(/\s+/g,'-');}
  async snapshotCoinState(row){
    await this.ensureFolder(this.historyFolder());const noteContent=await this.app.vault.read(row.file),coverPath=this.localPath(row),snapshot={notePath:row.file.path,noteContent,coverPath,backupImagePath:'',createdAt:new Date().toISOString()};
    if(coverPath){const coverFile=this.app.vault.getAbstractFileByPath(coverPath);if(coverFile instanceof TFile){const ext=coverFile.extension||'bin',backup=this.join(this.historyFolder(),`${this.historyKey(row)}.${ext}`);await this.app.vault.adapter.writeBinary(backup,new Uint8Array(await this.app.vault.readBinary(coverFile)));snapshot.backupImagePath=backup;}}
    await this.app.vault.adapter.write(this.join(this.historyFolder(),`${this.historyKey(row)}.json`),JSON.stringify(snapshot,null,2));
  }
  async undoCoinChange(row){
    const metaPath=this.join(this.historyFolder(),`${this.historyKey(row)}.json`);if(!(await this.app.vault.adapter.exists(metaPath)))return false;const snapshot=JSON.parse(await this.app.vault.adapter.read(metaPath)),current=this.getRows().find(r=>r.file.path===row.file.path),currentCover=current?this.localPath(current):'';
    if(snapshot.backupImagePath&&snapshot.coverPath&&await this.app.vault.adapter.exists(snapshot.backupImagePath)){await this.app.vault.adapter.writeBinary(snapshot.coverPath,new Uint8Array(await this.app.vault.adapter.readBinary(snapshot.backupImagePath)));}
    await this.app.vault.modify(row.file,snapshot.noteContent);if(currentCover&&currentCover!==snapshot.coverPath&&await this.app.vault.adapter.exists(currentCover))await this.app.vault.adapter.remove(currentCover);await this.app.vault.adapter.remove(metaPath);if(snapshot.backupImagePath&&await this.app.vault.adapter.exists(snapshot.backupImagePath))await this.app.vault.adapter.remove(snapshot.backupImagePath);return true;
  }
  async loadCustomCoverFromDisk(row,file){
    await this.ensureFolder(this.covers());const ext=(file.name.split('.').pop()||'png').toLowerCase(),desired=await this.uniqueCoverPath(this.join(this.covers(),`${this.coverFileStem(row)}.${ext}`),this.localPath(row));await this.app.vault.adapter.writeBinary(desired,new Uint8Array(await file.arrayBuffer()));await this.app.fileManager.processFrontMatter(row.file,fm=>{fm.cover=`[[${desired}]]`;fm.reference_year=tx(row.year);fm.cover_locked=true;fm.own_cover=true;});
  }
  async downloadNumistaCoverForCoin(row){
    if(!row.numista_id)throw new Error('Brak numista_id');const details=await this.api(`/types/${encodeURIComponent(row.numista_id)}?lang=en`),url=this.pickImage(details);if(!url)throw new Error('Numista nie zwróciła okładki');const path=await this.downloadCover(url,row.numista_id,row.numista_issue_id||row.year);await this.app.fileManager.processFrontMatter(row.file,fm=>{fm.cover=`[[${path}]]`;fm.cover_url=url;fm.cover_locked=false;fm.own_cover=false;});
  }
  async updateSingleCoinFromNumista(row){
    if(!row.numista_id)throw new Error('Brak numista_id');const details=await this.api(`/types/${encodeURIComponent(row.numista_id)}?lang=en`),issuesRaw=await this.api(`/types/${encodeURIComponent(row.numista_id)}/issues?lang=en`),issues=Array.isArray(issuesRaw)?issuesRaw:(issuesRaw.issues||[]),issue=issues.find(i=>String(i.id)===String(row.numista_issue_id))||issues.find(i=>String(i.gregorian_year||i.year)===String(row.year)&&tx(i.mint_letter)===tx(row.mint_mark));if(!issue)throw new Error('Nie znaleziono emisji Numista');const photo=this.photoMetadata(details),valuation=await this.issueNumismaticValues(row.numista_id,issue.id);await this.upsert({...row,country:countryName(details.issuer?.name),title:normalizeCoinTitle(details.title),mintage:issue.mintage??row.mintage,numista_url:tx(details.url),...photo,numismatic_value_currency:valuation.currency,numismatic_values:valuation.values,numismatic_value_unc:valuation.unc},row.file);
  }
  buildReferenceCoverIndex(rows){
    const index=new Map();
    for(const row of rows){
      const key=[countryName(row.country).toLowerCase(),tx(row.coin_type).toLowerCase(),String(row.year)].join('|');
      if(!index.has(key))index.set(key,[]);
      index.get(key).push(row);
    }
    return index;
  }
  resolveDisplayCover(row,index){
    const ownSrc=this.coverSrc(row);
    const referenceYear=tx(row.reference_year);
    if(!referenceYear||String(referenceYear)===String(row.year)){
      return {src:ownSrc,source:row,resolved:Boolean(ownSrc),usesReference:false};
    }
    const key=[countryName(row.country).toLowerCase(),tx(row.coin_type).toLowerCase(),String(referenceYear)].join('|');
    const candidates=index.get(key)||[];
    const sameMint=candidates.find(candidate=>tx(candidate.mint_mark)&&tx(candidate.mint_mark)===tx(row.mint_mark)&&this.coverSrc(candidate));
    const noMint=candidates.find(candidate=>!tx(candidate.mint_mark)&&this.coverSrc(candidate));
    const anyCover=candidates.find(candidate=>this.coverSrc(candidate));
    const source=sameMint||noMint||anyCover||null;
    if(source){
      return {src:this.coverSrc(source),source,resolved:true,usesReference:true};
    }
    return {src:ownSrc,source:null,resolved:false,usesReference:true};
  }
  async renderDashboard(el,initialState=null){
    let rows=this.getRows();if(this._pendingRowOverrides?.size){rows=rows.map(row=>this._pendingRowOverrides.has(row.file.path)?{...row,...this._pendingRowOverrides.get(row.file.path),file:row.file}:row);}if(this._lastSavedOverride?.file){rows=rows.map(row=>row.file.path===this._lastSavedOverride.file.path?{...row,...this._lastSavedOverride.data,file:row.file}:row);}const referenceCoverIndex=this.buildReferenceCoverIndex(rows);
    if(initialState)this.setDashboardState(initialState);const state=this.getDashboardState();el.empty();el.addClass('twoeuro-view');el.style.setProperty('--twoeuro-columns',String(Math.min(10,Math.max(4,Number(this.settings.columns)||6))));
    const header=el.createDiv({cls:'twoeuro-header'});header.createEl('h2',{text:this.t('collection.title')});const summary=header.createDiv({cls:'twoeuro-summary'});const grid=el.createDiv({cls:'twoeuro-grid'});
    let list=rows.filter(r=>state.mode==='all'||state.mode===r.coin_type||(state.mode==='owned'&&r.owned)||(state.mode==='missing'&&!r.owned));if(state.country)list=list.filter(r=>r.country===state.country);if(state.year)list=list.filter(r=>r.year===state.year);const q=(state.searchText||'').toLowerCase();if(q)list=list.filter(r=>[r.country,r.title,r.year,r.mint_mark].join(' ').toLowerCase().includes(q));
    const locale=this.getLanguage()==='pl'?'pl':'en';list.sort((a,b)=>{const yearA=Number(a.year)||0,yearB=Number(b.year)||0,countryCmp=String(a.country||'').localeCompare(String(b.country||''),locale,{sensitivity:'base'}),titleCmp=String(a.title||'').localeCompare(String(b.title||''),locale,{numeric:true,sensitivity:'base'}),mintCmp=String(a.mint_mark||'').localeCompare(String(b.mint_mark||''),locale,{numeric:true,sensitivity:'base'});if(state.sortMode==='yearDesc')return (yearB-yearA)||countryCmp||titleCmp||mintCmp;if(state.sortMode==='countryAsc')return countryCmp||(yearA-yearB)||titleCmp||mintCmp;if(state.sortMode==='countryDesc')return (-countryCmp)||(yearA-yearB)||titleCmp||mintCmp;return (yearA-yearB)||countryCmp||titleCmp||mintCmp;});
    summary.setText(this.t('summary.owned',{owned:list.filter(r=>r.owned).length,total:list.length}));
    for(const r of list){const card=grid.createDiv({cls:`twoeuro-card ${r.owned?'is-owned':'is-missing'} ${(this.selectedCoinPaths||new Set()).has(r.file.path)?'is-selected':''}`});
      const selectWrap=card.createDiv({cls:'twoeuro-card-select'}),selectBox=selectWrap.createEl('input',{attr:{type:'checkbox','aria-label':this.t('sidebar.selected',{count:1})}});selectBox.checked=(this.selectedCoinPaths||new Set()).has(r.file.path);selectWrap.onclick=e=>e.stopPropagation();selectBox.onclick=e=>e.stopPropagation();selectBox.onchange=()=>{this.toggleCoinSelection(r.file.path,selectBox.checked);card.toggleClass('is-selected',selectBox.checked);};
      const cover=card.createDiv({cls:'twoeuro-cover'}),coverResolution=this.resolveDisplayCover(r,referenceCoverIndex),src=coverResolution.src;
      let indicatorClass=r.own_cover?'is-own-cover':'is-missing-reference',indicatorTitle=r.own_cover?this.t('indicator.ownCover'):this.t('indicator.missing');if(!r.own_cover&&r.reference_year){if(String(r.reference_year)===String(r.year)){indicatorClass='is-exact';indicatorTitle=this.t('indicator.exact');}else if(coverResolution.resolved&&coverResolution.source){indicatorClass='is-reference';indicatorTitle=this.t('indicator.reference',{country:coverResolution.source.country,type:coverResolution.source.coin_type,year:coverResolution.source.year});}else{indicatorTitle=this.t('indicator.notFound',{year:r.reference_year});}}const indicator=cover.createDiv({cls:`twoeuro-image-indicator ${indicatorClass}`});indicator.setAttribute('title',indicatorTitle);
      if(src)cover.createEl('img',{attr:{src,alt:r.title,title:coverResolution.usesReference&&coverResolution.source?this.t('image.reference',{year:coverResolution.source.year}):r.title}});else cover.createDiv({cls:'twoeuro-placeholder',text:'2 €'});
      const info=card.createDiv({cls:'twoeuro-info'});info.createDiv({cls:'twoeuro-country',text:r.country});info.createDiv({cls:'twoeuro-title',text:r.title});info.createDiv({cls:'twoeuro-meta',text:`${r.year} · ${r.coin_type==='national'?this.t('coin.national'):this.t('coin.commemorative')}${r.mint_mark?` · ${r.mint_mark}`:''}`});info.createDiv({cls:'twoeuro-status',text:r.owned?`✓ ${this.t('status.owned')}`:`○ ${this.t('status.missing')}`});cover.onclick=event=>{event.stopPropagation();this.currentCoinFile=r.file;new CoinCoverManagerModal(this.app,this,r,src).open();};
      info.onclick=event=>{event.stopPropagation();this.currentCoinFile=r.file;new CoinModal(this.app,this,r).open();};
    }
    el._twoEuroState=this.getDashboardState();
  }

};
