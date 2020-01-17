
// import and re-export
import { importComponent } from 'meteor/vulcan:lib';
export * from 'meteor/vulcan:lib';

export * from './default_mutations.js';
export * from './default_resolvers.js';

import './components.js';

export * from './components/App.jsx';
importComponent(["Datatable", "DatatableLayout", "DatatableAbove", "DatatableAboveSearchInput", "DatatableAboveLayout", "DatatableHeaderCellLayout", "DatatableSorter", "DatatableContents", "DatatableContentsLayout", "DatatableContentsInnerLayout", "DatatableContentsHeadLayout", "DatatableContentsBodyLayout", "DatatableContentsMoreLayout", "DatatableLoadMoreButton", "DatatableTitle", "DatatableRow", "DatatableRowLayout", "DatatableCell", "DatatableCellLayout", "DatatableDefaultCell"], () => require('./components/Datatable.jsx'));
importComponent("ScrollToTop", () => require('./components/ScrollToTop.jsx'));

export * from './containers/cacheUpdates.js';
export { default as withMulti, useMulti } from './containers/withMulti.js';
export { default as withSingle, useSingle } from './containers/withSingle.js';
export { default as withCreate, useCreate } from './containers/withCreate.js';
export { default as withUpdate, useUpdate } from './containers/withUpdate.js';
export { default as withDelete } from './containers/withDelete.js';
export { default as withCurrentUser } from './containers/withCurrentUser.js';
export { default as withMutation } from './containers/withMutation.js';

export { default as MessageContext } from './messages.js';

// OpenCRUD backwards compatibility
export { default as withNew } from './containers/withCreate.js';
export { default as withEdit } from './containers/withUpdate.js';
export { default as withRemove } from './containers/withDelete.js';
export { default as withList } from './containers/withMulti.js';
export { default as withDocument } from './containers/withSingle.js';
