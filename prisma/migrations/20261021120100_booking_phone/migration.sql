-- The number a flyer advertises for a night. It belongs to the event until we
-- learn whose it is; no Organiser is created for it. Internal: public_events
-- lists its columns explicitly and does not gain these.
ALTER TABLE "Occurrence" ADD COLUMN "bookingPhone" TEXT,
ADD COLUMN "bookingPhoneNote" TEXT;

ALTER TABLE "Residency" ADD COLUMN "bookingPhone" TEXT,
ADD COLUMN "bookingPhoneNote" TEXT;

-- An MC is billed after the music: "The Clan Band, DJ Smallz on the decks, MC Kasuku".
CREATE OR REPLACE FUNCTION compose_billing(lineup TEXT[]) RETURNS TEXT
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  billed TEXT; r "ActRole";
  roles TEXT[] := '{}'; lead TEXT[] := '{}'; artists TEXT[] := '{}'; djs TEXT[] := '{}'; hosts TEXT[] := '{}'; mcs TEXT[] := '{}';
  has_band BOOLEAN := false; names TEXT[] := '{}'; result TEXT;
BEGIN
  FOREACH billed IN ARRAY coalesce(lineup, '{}') LOOP
    billed := btrim(billed);
    CONTINUE WHEN billed = '';
    names := names || billed;
    r := (act_for(billed))."role";
    roles := roles || coalesce(r::TEXT, '-');
    IF r = 'HOST' THEN hosts := hosts || billed;
    ELSIF r = 'MCEE' THEN mcs := mcs || billed;
    ELSIF r = 'DJ' THEN djs := djs || billed;
    ELSIF r = 'ARTIST' THEN artists := artists || billed;
    ELSE
      lead := lead || billed;
      IF r = 'BAND' THEN has_band := true; END IF;
    END IF;
  END LOOP;

  IF cardinality(names) = 0 THEN RETURN NULL; END IF;
  IF (SELECT count(DISTINCT x) FROM unnest(roles) x) = 1 THEN RETURN plain_list(names); END IF;

  IF cardinality(artists) > 0 AND has_band THEN
    result := plain_list(lead) || ' with ' || plain_list(artists);
  ELSE
    result := plain_list(lead || artists);
  END IF;
  IF cardinality(djs) > 0 THEN
    result := CASE WHEN result = '' THEN plain_list(djs) || ' on the decks'
                   ELSE result || ', ' || plain_list(djs) || ' on the decks' END;
  END IF;
  IF cardinality(hosts) > 0 THEN
    result := CASE WHEN result = '' THEN 'hosted by ' || plain_list(hosts)
                   ELSE result || ', hosted by ' || plain_list(hosts) END;
  END IF;
  IF cardinality(mcs) > 0 THEN
    result := CASE WHEN result = '' THEN 'MC ' || plain_list(mcs)
                   ELSE result || ', MC ' || plain_list(mcs) END;
  END IF;
  RETURN result;
END
$$;
