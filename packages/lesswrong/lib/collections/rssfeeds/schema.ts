import { foreignKeyField } from '../../utils/schemaUtils'
import { schemaDefaultValue } from '../../collectionUtils';

const schema: SchemaType<"RSSFeeds"> = {
  userId: {
    ...foreignKeyField({
      idFieldName: "userId",
      resolverName: "user",
      collectionName: "Users",
      type: "User",
      nullable: true,
    }),
    hidden: true,
    canRead: ['guests'],
    canCreate: ['members'],
    canUpdate: ['admins'],
    optional: true,
  },
  ownedByUser: {
    type: Boolean,
    canRead: ['guests'],
    canCreate: ['members'],
    canUpdate: ['admins'],
    control: "checkbox",
    optional: true,
    order: 30,
    ...schemaDefaultValue(false),
  },
  displayFullContent: {
    type: Boolean,
    canRead: ['guests'],
    canCreate: ['members'],
    canUpdate: ['admins'],
    control: "checkbox",
    optional: true,
    order: 40,
    ...schemaDefaultValue(false),
  },
  nickname: {
    type: String,
    canRead: ['guests'],
    canCreate: ['members'],
    canUpdate: ['admins'],
    optional: true,
    order: 10,
  },
  url: {
    type: String,
    canRead: ['guests'],
    canCreate: ['members'],
    canUpdate: ['admins'],
    optional: true,
    order: 20,
  },
  // Set to 'inactive' to prevent posting
  status: {
    type: String,
    canRead: ['guests'],
    canUpdate: ['admins'],
    optional: true,
  },
  rawFeed: {
    type: Object,
    hidden: true,
    canRead: ['guests'],
    canCreate: ['members'],
    canUpdate: ['admins'],
    optional: true,
    logChanges: false,
  },
  setCanonicalUrl: {
    type: Boolean,
    canRead: ['guests'],
    canCreate: ['members'],
    canUpdate: ['members'],
    optional: true,
    control: "checkbox",
    label: "Set the canonical url tag on crossposted posts",
    ...schemaDefaultValue(false)
  },
  importAsDraft: {
    type: Boolean,
    canRead: ['guests'],
    canCreate: ['members'],
    canUpdate: ['admins'],
    optional: true,
    control: "checkbox",
    label: "Import posts as draft",
    ...schemaDefaultValue(false),
  },
};

export default schema;
